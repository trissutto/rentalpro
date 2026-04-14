import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { code: params.code.toUpperCase() },
      select: {
        id: true,
        code: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        guestCount: true,
        checkIn: true,
        checkOut: true,
        nights: true,
        totalAmount: true,
        cleaningFee: true,
        paymentStatus: true,
        paymentMethod: true,
        createdAt: true,
        property: {
          select: { id: true, name: true, address: true, city: true, state: true, rules: true },
        },
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    }

    // Rooms — separate query with explicit select to avoid Prisma client issues
    let rooms: { name: string; type: string; active: boolean; order: number; propertyItems: { quantity: number; item: { name: string; icon: string; unit: string } }[] }[] = [];
    try {
      const rawRooms = await prisma.$queryRaw<{
        room_name: string; room_type: string; room_active: boolean; room_order: number;
        item_name: string | null; item_icon: string | null; item_unit: string | null; pi_qty: number | null;
      }[]>`
        SELECT r.name as room_name, r.type as room_type, r.active as room_active, r."order" as room_order,
               i.name as item_name, i.icon as item_icon, i.unit as item_unit, pi.quantity as pi_qty
        FROM "rooms" r
        LEFT JOIN "property_items" pi ON pi."roomId" = r.id
        LEFT JOIN "items" i ON i.id = pi."itemId"
        WHERE r."propertyId" = ${reservation.property.id}
        ORDER BY r."order" ASC, i.name ASC
      `;
      // Group by room
      const roomMap = new Map<string, typeof rooms[0]>();
      for (const row of rawRooms) {
        if (!roomMap.has(row.room_name)) {
          roomMap.set(row.room_name, { name: row.room_name, type: row.room_type, active: row.room_active, order: row.room_order, propertyItems: [] });
        }
        if (row.item_name) {
          roomMap.get(row.room_name)!.propertyItems.push({
            quantity: row.pi_qty || 1,
            item: { name: row.item_name, icon: row.item_icon || "📦", unit: row.item_unit || "un" },
          });
        }
      }
      rooms = Array.from(roomMap.values());
      console.log(`Rooms loaded: ${rooms.length}, total items: ${rooms.reduce((s,r) => s + r.propertyItems.length, 0)}`);
    } catch (e) {
      console.error("Rooms query error:", e);
    }

    // Guests — separate query (new relation, may not be in Prisma client yet)
    let guests: { name: string; birthDate: Date | null; docType: string; docNumber: string }[] = [];
    try {
      guests = await prisma.guest.findMany({
        where: { reservationId: reservation.id },
        select: { name: true, birthDate: true, docType: true, docNumber: true },
      }) as typeof guests;
    } catch { /* guests table not created yet */ }

    // New property fields — raw SQL fallback
    let checkInTime = "14:00";
    let checkOutTime = "12:00";
    try {
      const raw = await prisma.$queryRaw<{ checkInTime: string | null; checkOutTime: string | null }[]>`
        SELECT "checkInTime", "checkOutTime" FROM "properties" WHERE "id" = ${reservation.property.id} LIMIT 1
      `;
      if (raw?.[0]?.checkInTime) checkInTime = raw[0].checkInTime;
      if (raw?.[0]?.checkOutTime) checkOutTime = raw[0].checkOutTime;
    } catch { /* new columns not in DB yet */ }

    const pdf = await generateContractPdf({
      ...reservation,
      property: { ...reservation.property, checkInTime, checkOutTime, rooms },
      guests,
    });
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="contrato-${reservation.code}.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "Erro ao gerar contrato PDF" }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateContractPdf(r: any): Promise<Buffer> {
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString("pt-BR");
  const fmtCur = (v: number) =>
    `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const accommodationAmount = Number(r.totalAmount) - Number(r.cleaningFee);
  const checkInDate = fmtDate(r.checkIn);
  const checkOutDate = fmtDate(r.checkOut);
  const generatedDate = new Date().toLocaleDateString("pt-BR");
  const checkInTime = r.property.checkInTime || "14:00";
  const checkOutTime = r.property.checkOutTime || "12:00";

  const safe = (s: string | null | undefined) =>
    (s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, " ");

  // Build rules list
  const defaultRules = [
    "E vedado fumar em qualquer dependencia interna do imovel.",
    "O silencio deve ser mantido apos as 22h00, respeitando os demais moradores e a vizinhanca.",
    "Nao e permitida a realizacao de festas, eventos ou reunioes sem autorizacao previa e por escrito do Locador.",
    "A presenca de animais de estimacao deve ser informada e autorizada previamente.",
    "O numero maximo de hospedes e de " + r.guestCount + " pessoas, conforme declarado no ato da reserva.",
    "E vedado o subaluguel ou cessao do imovel a terceiros.",
    "O Locatario e responsavel por danos causados ao imovel e ao mobiliario durante o periodo de locacao.",
    "O uso da piscina, churrasqueira e areas comuns e de responsabilidade dos hospedes.",
    "Lixo deve ser separado e descartado conforme orientacoes do imovel.",
    "A chave/acesso ao imovel deve ser devolvido/encerrado no ato do check-out.",
  ];
  const rules = (r.property.rules
    ? r.property.rules.split("\n").filter(Boolean).map((s: string) => safe(s))
    : defaultRules);

  // Build inventory grouped by room — filter/sort in JS to avoid Prisma nested where issues
  interface PropertyItem { item: { name: string; icon: string; unit: string }; quantity: number; notes?: string | null }
  interface RoomData { name: string; type: string; active?: boolean; order?: number; propertyItems: PropertyItem[] }

  const inventoryRooms: RoomData[] = (r.property.rooms || [])
    .filter((room: RoomData) => room.active !== false && room.propertyItems && room.propertyItems.length > 0)
    .sort((a: RoomData, b: RoomData) => (a.order ?? 0) - (b.order ?? 0));

  const roomTypeIcons: Record<string, string> = {
    kitchen: "Cozinha", living: "Sala de Estar", bedroom: "Quarto",
    bathroom: "Banheiro", gourmet: "Area Gourmet", pool: "Piscina",
    garage: "Garagem", outdoor: "Area Externa", other: "Geral",
  };

  // Build Python inventory section — always included (even if no items configured yet)
  let inventoryPy = `
story.append(PageBreak())
story.append(Paragraph('ANEXO I', title_s))
story.append(Paragraph('Inventario e Relacao de Bens do Imovel', sub_s))
story.append(Paragraph('${safe(r.property.name)} - Reserva: ${r.code}', sub_s))
story.append(HRFlowable(width='100%', thickness=1.5, color=brand, spaceAfter=10))
story.append(Paragraph(
  'O presente Anexo faz parte integrante do Contrato de Locacao por Temporada firmado entre as partes. '
  'Os itens abaixo devem ser conferidos pelo hospede no momento do check-in e check-out. '
  'Divergencias devem ser comunicadas imediatamente ao administrador.',
  body_s
))
story.append(Spacer(1, 10))
`;
  if (inventoryRooms.length > 0) {
    for (const room of inventoryRooms) {
      const roomLabel = roomTypeIcons[room.type] || room.name;
      inventoryPy += `
story.append(Paragraph('${safe(roomLabel)} - ${safe(room.name)}', sec_s))
inv_data_${inventoryRooms.indexOf(room)} = [
    [Paragraph('<b>Item</b>', small_bold), Paragraph('<b>Qtd</b>', small_bold), Paragraph('<b>Unid.</b>', small_bold), Paragraph('<b>Check-in</b>', small_bold), Paragraph('<b>Check-out</b>', small_bold)],
`;
      for (const pi of room.propertyItems) {
        const name = safe(pi.item.name);
        const unit = safe(pi.item.unit || "un");
        const qty = pi.quantity;
        inventoryPy += `    [Paragraph('${pi.item.icon} ${name}', small_s), '${qty}', '${unit}', '☐', '☐'],\n`;
      }
      const idx = inventoryRooms.indexOf(room);
      inventoryPy += `]
t_inv_${idx} = Table(inv_data_${idx}, colWidths=[9*cm, 1.5*cm, 2*cm, 2*cm, 2*cm])
t_inv_${idx}.setStyle(TableStyle([
    ('FONTSIZE', (0,0), (-1,-1), 9),
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f0f0ff')),
    ('TEXTCOLOR', (0,0), (-1,0), brand),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [light, colors.white]),
    ('GRID', (0,0), (-1,-1), 0.3, colors.HexColor('#e2e8f0')),
    ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LEFTPADDING', (0,0), (-1,-1), 8),
    ('ALIGN', (1,0), (-1,-1), 'CENTER'), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
]))
story.append(t_inv_${idx})
story.append(Spacer(1, 8))
`;
    }

    // Signature area for annex
    inventoryPy += `
story.append(Spacer(1, 20))
story.append(Paragraph('Declaramos ter conferido os itens acima e que os mesmos se encontram em perfeito estado de conservacao:', body_s))
story.append(Spacer(1, 24))
sig_annex = Table([
    ['_______________________________', '_______________________________'],
    ['Hospede: ${safe(r.guestName)}', 'Administrador / Locador'],
    ['Check-in: ${checkInDate}', 'Check-in: ${checkInDate}'],
], colWidths=[8.5*cm, 8.5*cm])
sig_annex.setStyle(TableStyle([
    ('FONTSIZE', (0,0), (-1,-1), 9), ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('FONTNAME', (0,1), (-1,1), 'Helvetica-Bold'),
    ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
]))
story.append(sig_annex)
story.append(Spacer(1, 14))
story.append(Paragraph('Conferencia no Check-out (${checkOutDate}):', sec_s))
story.append(Spacer(1, 24))
sig_annex2 = Table([
    ['_______________________________', '_______________________________'],
    ['Hospede: ${safe(r.guestName)}', 'Administrador / Locador'],
    ['Check-out: ${checkOutDate}', 'Check-out: ${checkOutDate}'],
], colWidths=[8.5*cm, 8.5*cm])
sig_annex2.setStyle(TableStyle([
    ('FONTSIZE', (0,0), (-1,-1), 9), ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('FONTNAME', (0,1), (-1,1), 'Helvetica-Bold'),
    ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
]))
story.append(sig_annex2)
`;
  } else {
    // No items configured — show placeholder message + signature lines
    inventoryPy += `
story.append(Paragraph(
  'Nenhum item cadastrado para este imovel ainda. '
  'Acesse o painel administrativo e cadastre os comodos e itens para que este inventario seja preenchido automaticamente.',
  warn_s
))
story.append(Spacer(1, 30))
sig_empty = Table([
    ['_______________________________', '_______________________________'],
    ['Hospede: ${safe(r.guestName)}', 'Administrador / Locador'],
    ['Check-in: ${checkInDate}', 'Check-in: ${checkInDate}'],
], colWidths=[8.5*cm, 8.5*cm])
sig_empty.setStyle(TableStyle([
    ('FONTSIZE', (0,0), (-1,-1), 9), ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('FONTNAME', (0,1), (-1,1), 'Helvetica-Bold'),
    ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
]))
story.append(sig_empty)
`;
  }

  // Guests section
  let guestsPy = "";
  if (r.guests && r.guests.length > 0) {
    guestsPy = `
story.append(Paragraph('5. HOSPEDES', sec_s))
guests_data = [
    [Paragraph('<b>#</b>', small_bold), Paragraph('<b>Nome Completo</b>', small_bold), Paragraph('<b>Nascimento</b>', small_bold), Paragraph('<b>Doc. / Numero</b>', small_bold)],
`;
    for (let i = 0; i < r.guests.length; i++) {
      const g = r.guests[i];
      const bd = g.birthDate ? new Date(g.birthDate).toLocaleDateString("pt-BR") : "—";
      guestsPy += `    ['${i + 1}', Paragraph('${safe(g.name)}', small_s), '${bd}', '${safe(g.docType)}: ${safe(g.docNumber)}'],\n`;
    }
    guestsPy += `]
t_guests = Table(guests_data, colWidths=[0.8*cm, 7*cm, 3*cm, 5*cm])
t_guests.setStyle(TableStyle([
    ('FONTSIZE', (0,0), (-1,-1), 9),
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f0f0ff')),
    ('TEXTCOLOR', (0,0), (-1,0), brand),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [light, colors.white]),
    ('GRID', (0,0), (-1,-1), 0.3, colors.HexColor('#e2e8f0')),
    ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LEFTPADDING', (0,0), (-1,-1), 8),
    ('ALIGN', (0,0), (0,-1), 'CENTER'), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
]))
story.append(t_guests)
`;
  }

  const rulesLines = rules.map((r: string) => `story.append(Paragraph('&bull; ${r}', body_s))`).join("\n");

  const tmpDir = tmpdir();
  const scriptPath = join(tmpDir, `contract_${r.code}.py`);
  const pdfPath = join(tmpDir, `contract_${r.code}.pdf`);

  const script = `# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, PageBreak, KeepTogether
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT

W, H = A4

def make_header(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor('#4f46e5'))
    canvas.rect(0, H - 28, W, 28, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont('Helvetica-Bold', 10)
    canvas.drawString(2.5*cm, H - 19, 'CONTRATO DE LOCACAO POR TEMPORADA')
    canvas.setFont('Helvetica', 9)
    canvas.drawRightString(W - 2.5*cm, H - 19, 'Reserva: ${r.code}')
    canvas.setFillColor(colors.HexColor('#94a3b8'))
    canvas.setFont('Helvetica', 7.5)
    canvas.drawString(2.5*cm, 16, 'Emitido em: ${generatedDate}  |  Documento gerado automaticamente pelo RentalPro')
    canvas.drawRightString(W - 2.5*cm, 16, f'Pagina {doc.page}')
    canvas.setStrokeColor(colors.HexColor('#e2e8f0'))
    canvas.line(2.5*cm, 26, W - 2.5*cm, 26)
    canvas.restoreState()

doc = SimpleDocTemplate(
    "${pdfPath.replace(/\\/g, "/")}",
    pagesize=A4,
    rightMargin=2.5*cm, leftMargin=2.5*cm,
    topMargin=2.8*cm, bottomMargin=2.2*cm,
    onFirstPage=make_header, onLaterPages=make_header,
)

styles = getSampleStyleSheet()
brand  = colors.HexColor('#4f46e5')
dark   = colors.HexColor('#1e293b')
muted  = colors.HexColor('#64748b')
light  = colors.HexColor('#f8fafc')
green  = colors.HexColor('#16a34a')
amber  = colors.HexColor('#92400e')

T = lambda txt, **kw: ParagraphStyle(txt, parent=styles['Normal'], **kw)
title_s    = T('t',   fontSize=17, fontName='Helvetica-Bold', textColor=brand, spaceAfter=3, alignment=TA_CENTER)
sub_s      = T('s',   fontSize=10, textColor=muted, alignment=TA_CENTER, spaceAfter=3)
sec_s      = T('sec', fontSize=11, fontName='Helvetica-Bold', textColor=brand, spaceBefore=12, spaceAfter=6)
body_s     = T('b',   fontSize=9.5, textColor=dark, leading=16, alignment=TA_JUSTIFY, spaceAfter=4)
small_s    = T('sm',  fontSize=9,   textColor=dark, leading=13)
small_bold = T('smb', fontSize=9,   fontName='Helvetica-Bold', textColor=dark, leading=13)
footer_s   = T('f',   fontSize=8,   textColor=muted, alignment=TA_CENTER)
warn_s     = T('w',   fontSize=9,   textColor=amber, leading=14, alignment=TA_JUSTIFY)

story = []

# ── CABECALHO ──────────────────────────────────────────────────────────────────
story.append(Spacer(1, 4))
story.append(Paragraph('CONTRATO DE LOCACAO POR TEMPORADA', title_s))
story.append(Paragraph('${safe(r.property.name)}  ·  ${safe(r.property.city)} / ${safe(r.property.state)}', sub_s))
story.append(Paragraph('Codigo de Reserva: <b>${r.code}</b>', sub_s))
story.append(HRFlowable(width='100%', thickness=2, color=brand, spaceAfter=12))

# ── PREAMBULO ─────────────────────────────────────────────────────────────────
story.append(Paragraph('PREAMBULO', sec_s))
story.append(Paragraph(
    'Pelo presente instrumento particular, as partes identificadas abaixo celebram o presente '
    'Contrato de Locacao por Temporada, nos termos da Lei 8.245/91 (Lei do Inquilinato), '
    'em especial os artigos 48 a 50, que regem as locacoes residenciais por temporada, '
    'mediante as clausulas e condicoes a seguir estabelecidas.',
    body_s
))

# ── 1. PARTES ─────────────────────────────────────────────────────────────────
story.append(Paragraph('CLAUSULA 1 - DAS PARTES', sec_s))
p1_data = [
    [Paragraph('<b>LOCADOR / ADMINISTRADOR</b>', small_bold), ''],
    ['Imovel:', Paragraph('<b>${safe(r.property.name)}</b>', small_bold)],
    ['Endereco:', '${safe(r.property.address)}, ${safe(r.property.city)} - ${safe(r.property.state)}'],
    [Paragraph('<b>LOCATARIO / HOSPEDE</b>', small_bold), ''],
    ['Responsavel:', Paragraph('<b>${safe(r.guestName)}</b>', small_bold)],
    ['E-mail:', '${safe(r.guestEmail || "nao informado")}'],
    ['Telefone:', '${safe(r.guestPhone || "nao informado")}'],
    ['N. de hospedes:', '<b>${r.guestCount} pessoa(s)</b>'],
]
t1 = Table(p1_data, colWidths=[4.5*cm, None])
t1.setStyle(TableStyle([
    ('FONTSIZE', (0,0), (-1,-1), 9.5),
    ('TEXTCOLOR', (0,0), (0,-1), muted),
    ('ROWBACKGROUNDS', (0,0), (-1,-1), [light, colors.white]),
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#eff6ff')),
    ('BACKGROUND', (0,3), (-1,3), colors.HexColor('#eff6ff')),
    ('SPAN', (0,0), (1,0)), ('SPAN', (0,3), (1,3)),
    ('FONTNAME', (0,0), (0,0), 'Helvetica-Bold'), ('FONTNAME', (0,3), (0,3), 'Helvetica-Bold'),
    ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LEFTPADDING', (0,0), (-1,-1), 8),
]))
story.append(t1)

# ── 2. OBJETO E PERIODO ───────────────────────────────────────────────────────
story.append(Paragraph('CLAUSULA 2 - DO OBJETO E PERIODO', sec_s))
story.append(Paragraph(
    'O presente contrato tem como objeto a locacao por temporada do imovel descrito na Clausula 1, '
    'destinado exclusivamente para uso residencial e de lazer, sendo vedada qualquer atividade '
    'comercial, industrial ou que contrarie a lei ou os costumes.',
    body_s
))
p2_data = [
    [Paragraph('<b>Check-in</b>', small_bold), Paragraph('<b>Check-out</b>', small_bold), Paragraph('<b>Noites</b>', small_bold), Paragraph('<b>Hospedes</b>', small_bold)],
    ['${checkInDate} a partir das ${checkInTime}', '${checkOutDate} ate as ${checkOutTime}', '<b>${r.nights}</b>', '<b>${r.guestCount}</b>'],
]
t2 = Table(p2_data, colWidths=[5*cm, 5*cm, 2.5*cm, 2.5*cm])
t2.setStyle(TableStyle([
    ('FONTSIZE', (0,0), (-1,-1), 9.5),
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f0fdf4')),
    ('TEXTCOLOR', (0,0), (-1,0), green),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f0fdf4')]),
    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#bbf7d0')),
    ('ALIGN', (0,0), (-1,-1), 'CENTER'), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('TOPPADDING', (0,0), (-1,-1), 6), ('BOTTOMPADDING', (0,0), (-1,-1), 6),
]))
story.append(t2)
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<b>Paragrafo Unico:</b> O prazo de locacao e intransferivel e improrrogavel sem expresso consentimento '
    'do Locador. A permanencia no imovel apos o horario de check-out sem autorizacao implicara '
    'cobranca de diaria adicional e ensejara o despejo administrativo imediato.',
    body_s
))

# ── 3. VALOR E PAGAMENTO ──────────────────────────────────────────────────────
story.append(Paragraph('CLAUSULA 3 - DO VALOR E FORMA DE PAGAMENTO', sec_s))
p3_data = [
    ['Hospedagem (${r.nights} noite(s)):', Paragraph('<b>${fmtCur(accommodationAmount)}</b>', small_bold)],
    ['Taxa de limpeza:', Paragraph('<b>${fmtCur(Number(r.cleaningFee))}</b>', small_bold)],
    [Paragraph('<b>VALOR TOTAL:</b>', small_bold), Paragraph('<b>${fmtCur(Number(r.totalAmount))}</b>', ParagraphStyle('tb', parent=styles['Normal'], fontSize=12, fontName='Helvetica-Bold', textColor=brand))],
    ['Status do pagamento:', Paragraph('<b>${r.paymentStatus === "PAID" ? "PAGO" : "AGUARDANDO PAGAMENTO"}${r.paymentMethod ? " via " + r.paymentMethod.toUpperCase() : ""}</b>', small_bold)],
]
t3 = Table(p3_data, colWidths=[8*cm, None])
t3.setStyle(TableStyle([
    ('FONTSIZE', (0,0), (-1,-1), 9.5),
    ('TEXTCOLOR', (0,0), (0,-1), muted),
    ('ROWBACKGROUNDS', (0,0), (-1,-1), [light, colors.white]),
    ('BACKGROUND', (0,2), (-1,2), colors.HexColor('#eff6ff')),
    ('GRID', (0,2), (-1,2), 0.5, brand),
    ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ('LEFTPADDING', (0,0), (-1,-1), 8),
]))
story.append(t3)
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<b>3.1</b> O valor ora pactuado refere-se exclusivamente ao periodo indicado neste instrumento. '
    'Alteracoes de datas ou inclusao de hospedes estao sujeitas a cobranca de valores adicionais.',
    body_s
))
story.append(Paragraph(
    '<b>3.2 Politica de Cancelamento:</b> Cancelamentos realizados com mais de 15 dias de antecedencia '
    'ao check-in tera direito a reembolso integral. Cancelamentos entre 7 e 15 dias receberao reembolso '
    'de 50%%. Cancelamentos com menos de 7 dias nao terao direito a reembolso. Casos fortuitos ou '
    'de forca maior serao analisados individualmente pelo Locador.',
    body_s
))
story.append(Paragraph(
    '<b>3.3</b> Em caso de danos ao imovel ou mobiliario, o Locatario autoriza desde ja o debito '
    'do valor correspondente ao conserto ou reposicao, apurado mediante orcamentos de mercado.',
    body_s
))

# ── 4. OBRIGACOES ─────────────────────────────────────────────────────────────
story.append(Paragraph('CLAUSULA 4 - DAS OBRIGACOES DAS PARTES', sec_s))
story.append(Paragraph('<b>4.1 Obrigacoes do Locador:</b>', body_s))
loc_obrig = [
    'Entregar o imovel em perfeitas condicoes de higiene, conservacao e habitabilidade.',
    'Fornecer ao Locatario as instrucoes necessarias para uso das instalacoes e equipamentos.',
    'Manter o imovel segurado contra incendio e outros sinistros durante o periodo de locacao.',
    'Nao perturbar o uso pacifico do imovel pelo Locatario durante o periodo contratado.',
    'Efetuar reparos urgentes que comprometam a habitabilidade, mediante comunicacao previa.',
]
for o in loc_obrig:
    story.append(Paragraph(f'&bull; {o}', body_s))

story.append(Spacer(1, 6))
story.append(Paragraph('<b>4.2 Obrigacoes do Locatario:</b>', body_s))
loc_obrig2 = [
    'Utilizar o imovel exclusivamente para fins de lazer e descanso, conforme pactuado.',
    'Zelar pela conservacao do imovel, mobiliario, utensilios e equipamentos.',
    'Comunicar imediatamente qualquer avaria, vazamento ou dano verificado no imovel.',
    'Devolver o imovel nas mesmas condicoes de limpeza e conservacao em que o recebeu.',
    'Respeitar o numero maximo de hospedes autorizado, vedada a entrada de visitantes em horario noturno sem autorizacao.',
    'Nao realizar obras, reformas ou intervencoes fisicas no imovel, mesmo que temporarias.',
    'Responsabilizar-se civil e criminalmente pelos atos dos hospedes sob sua responsabilidade.',
    'Cumprir rigorosamente as regras da casa descritas na Clausula 5 deste instrumento.',
]
for o in loc_obrig2:
    story.append(Paragraph(f'&bull; {o}', body_s))

# ── 5. REGRAS ─────────────────────────────────────────────────────────────────
story.append(Paragraph('CLAUSULA 5 - REGRAS DA CASA', sec_s))
story.append(Paragraph(
    'O Locatario declara ter conhecimento e concorda em cumprir integralmente as seguintes regras, '
    'cuja inobservancia podera implicar na rescisao imediata deste contrato sem direito a reembolso:',
    body_s
))
${rulesLines}

# ── 6. RESPONSABILIDADE ───────────────────────────────────────────────────────
story.append(Paragraph('CLAUSULA 6 - DA RESPONSABILIDADE CIVIL', sec_s))
story.append(Paragraph(
    '<b>6.1</b> O Locatario assume integral responsabilidade pelos danos fisicos causados ao imovel, '
    'seus equipamentos, mobiliario e instalacoes, sejam eles ocasionados por descuido, mal uso, '
    'acidentes ou atos intencionais, inclusive de seus acompanhantes e convidados.',
    body_s
))
story.append(Paragraph(
    '<b>6.2</b> O Locador nao se responsabiliza por objetos de valor, dinheiro, documentos ou '
    'quaisquer bens pessoais deixados no imovel. Recomenda-se o uso de cofre, quando disponivel.',
    body_s
))
story.append(Paragraph(
    '<b>6.3</b> O Locador nao se responsabiliza por acidentes pessoais ou danos a terceiros '
    'decorrentes do uso inadequado das instalacoes, piscinas, churrasqueiras ou areas comuns.',
    body_s
))
story.append(Paragraph(
    '<b>6.4</b> Qualquer dano constatado no imovel apos o check-out sera avaliado em ate 48 horas '
    'e cobrado do Locatario mediante apresentacao de orcamentos e nota fiscal dos reparos.',
    body_s
))

# ── 7. RESCISAO ───────────────────────────────────────────────────────────────
story.append(Paragraph('CLAUSULA 7 - DA RESCISAO', sec_s))
story.append(Paragraph(
    'O presente contrato podera ser rescindido de pleno direito, sem prejuizo das perdas e danos '
    'cabíveis, nas seguintes hipoteses:',
    body_s
))
rescisao = [
    'Descumprimento de qualquer clausula ou regra estabelecida neste contrato.',
    'Utilizacao do imovel para fins ilicitos ou imorais.',
    'Superlotacao do imovel acima da capacidade estipulada.',
    'Realizacao de festas, eventos ou reunioes sem autorizacao previa.',
    'Danos dolosos ou culposos ao imovel ou ao mobiliario.',
    'Perturbacao da ordem publica ou do sossego da vizinhanca.',
]
for r_item in rescisao:
    story.append(Paragraph(f'&bull; {r_item}', body_s))
story.append(Paragraph(
    'Paragrafo Unico: Na hipotese de rescisao por culpa do Locatario, nao havera direito a qualquer '
    'restituicao dos valores pagos, podendo o Locador exigir o ressarcimento de eventuais prejuizos.',
    body_s
))

# ── 8. PRIVACIDADE E LGPD ─────────────────────────────────────────────────────
story.append(Paragraph('CLAUSULA 8 - PRIVACIDADE E PROTECAO DE DADOS (LGPD)', sec_s))
story.append(Paragraph(
    'Os dados pessoais do Locatario e dos hospedes sao coletados exclusivamente para fins de '
    'execucao deste contrato, controle de acesso ao imovel e cumprimento de obrigacoes legais, '
    'em conformidade com a Lei 13.709/2018 (LGPD). Os dados nao serao comercializados ou '
    'cedidos a terceiros, salvo obrigacao legal ou ordem judicial.',
    body_s
))

# ── 9. FORO ───────────────────────────────────────────────────────────────────
story.append(Paragraph('CLAUSULA 9 - DO FORO', sec_s))
story.append(Paragraph(
    'As partes elegem o Foro da Comarca de <b>${safe(r.property.city)} - ${safe(r.property.state)}</b> '
    'para dirimir quaisquer controversias oriundas do presente contrato, renunciando a qualquer '
    'outro, por mais privilegiado que seja.',
    body_s
))

${guestsPy}

# ── ACEITE ────────────────────────────────────────────────────────────────────
story.append(Spacer(1, 10))
story.append(HRFlowable(width='100%', thickness=0.5, color=muted, spaceAfter=10))
story.append(Paragraph('ACEITE E ASSINATURA', sec_s))
story.append(Paragraph(
    'Ao efetuar o pagamento e/ou assinar o presente instrumento, o Locatario declara ter lido, '
    'compreendido e concordado integralmente com todas as clausulas e condicoes aqui estabelecidas, '
    'bem como com o inventario constante no Anexo I.',
    body_s
))
story.append(Paragraph(
    f'${safe(r.property.city)}, ${generatedDate}',
    ParagraphStyle('place', parent=styles['Normal'], fontSize=9, textColor=muted, spaceBefore=8, spaceAfter=20)
))

sig_main = Table([
    ['_________________________________', '_________________________________'],
    ['${safe(r.guestName)}', 'Locador / Administrador'],
    ['Locatario / Hospede Responsavel', '${safe(r.property.name)}'],
], colWidths=[8.5*cm, 8.5*cm])
sig_main.setStyle(TableStyle([
    ('FONTSIZE', (0,0), (-1,-1), 9), ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('FONTNAME', (0,1), (-1,1), 'Helvetica-Bold'),
    ('TEXTCOLOR', (0,2), (-1,2), muted),
    ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
]))
story.append(sig_main)

story.append(Spacer(1, 16))
story.append(Paragraph(
    'Documento gerado automaticamente  |  Reserva <b>${r.code}</b>  |  ${generatedDate}  |  RentalPro',
    footer_s
))

${inventoryPy}

doc.build(story, onFirstPage=make_header, onLaterPages=make_header)
`;

  writeFileSync(scriptPath, script, "utf-8");
  try {
    execSync(`python3 "${scriptPath}"`, { timeout: 30000 });
    const pdf = readFileSync(pdfPath);
    return pdf;
  } finally {
    if (existsSync(scriptPath)) unlinkSync(scriptPath);
    if (existsSync(pdfPath)) unlinkSync(pdfPath);
  }
}
