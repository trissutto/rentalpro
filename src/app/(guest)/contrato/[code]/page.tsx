"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Printer, MessageCircle } from "lucide-react";

const ROOM_ICONS: Record<string, string> = {
  kitchen: "🍳", living: "🛋️", bedroom: "🛏️", bathroom: "🚿",
  gourmet: "🍖", pool: "🏊", garage: "🚗", outdoor: "🌿", other: "📦",
};

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

interface ContractData {
  reservation: {
    code: string;
    guestName: string;
    guestEmail?: string;
    guestPhone?: string;
    guestCount: number;
    checkIn: string;
    checkOut: string;
    nights: number;
    totalAmount: number;
    cleaningFee: number;
    notes?: string;
    createdAt: string;
  };
  property: {
    name: string;
    address: string;
    city: string;
    state: string;
    rules?: string;
  };
  guests: { name: string; birthDate: string; docType: string; docNumber: string }[];
  checklist: { name: string; type: string; items: { name: string; icon: string; unit: string; quantity: number }[] }[];
}

export default function ContratoPage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/public/contract-data/${code}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok || d.error) { setError(d.error || "Erro ao carregar contrato"); return; }
        setData(d);
      })
      .catch(() => setError("Erro ao carregar contrato"))
      .finally(() => setLoading(false));
  }, [code]);

  function handleWhatsApp() {
    if (!data) return;
    const phone = data.reservation.guestPhone?.replace(/\D/g, "");
    const url = `${window.location.origin}/contrato/${code}`;
    const msg = encodeURIComponent(
      `Olá ${data.reservation.guestName}! 👋\n\nSegue o contrato da sua reserva na *${data.property.name}*.\n\n📄 Acesse pelo link:\n${url}\n\nCódigo da reserva: *${code}*\n\nQualquer dúvida estamos à disposição!`
    );
    window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-slate-500">{error || "Contrato não encontrado"}</p>
    </div>
  );

  const { reservation: res, property, guests, checklist } = data;
  const baseAmount = Number(res.totalAmount) - Number(res.cleaningFee);

  return (
    <>
      {/* Print/action bar — hidden on print */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div>
          <p className="font-bold text-slate-900 text-sm">Contrato de Reserva</p>
          <p className="text-xs text-slate-400 font-mono">{code}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleWhatsApp}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition"
          >
            <MessageCircle size={15} /> Enviar WhatsApp
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition"
          >
            <Printer size={15} /> Imprimir
          </button>
          <a
            href={`/api/public/contract/${code}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition"
          >
            ↓ Baixar PDF
          </a>
        </div>
      </div>

      {/* Contract body */}
      <div className="contract-page pt-16">
        <style>{`
          @media print {
            .no-print { display: none !important; }
            .contract-page { padding-top: 0 !important; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @page { margin: 20mm 15mm; }
          }
          .contract-page {
            max-width: 800px;
            margin: 0 auto;
            padding: 32px 24px 64px;
            font-family: 'Inter', -apple-system, sans-serif;
            color: #1e293b;
          }
          .contract-header { text-align: center; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #e2e8f0; }
          .contract-header h1 { font-size: 26px; font-weight: 800; color: #0f172a; margin: 0 0 4px; }
          .contract-header p { color: #64748b; font-size: 13px; margin: 0; }
          .contract-header .code-badge { display: inline-block; margin-top: 12px; padding: 4px 16px; background: #f1f5f9; border-radius: 999px; font-family: monospace; font-size: 15px; font-weight: 700; color: #1d4ed8; letter-spacing: 2px; }

          .section { margin-bottom: 28px; }
          .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #f1f5f9; }

          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .info-item { background: #f8fafc; border-radius: 10px; padding: 10px 14px; }
          .info-item .label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 3px; }
          .info-item .value { font-size: 14px; font-weight: 600; color: #0f172a; }

          .dates-row { display: grid; grid-template-columns: 1fr 1fr 80px; gap: 12px; }
          .date-card { text-align: center; padding: 14px; border-radius: 12px; }
          .date-card.checkin { background: #f0fdf4; border: 1px solid #bbf7d0; }
          .date-card.checkout { background: #fef2f2; border: 1px solid #fecaca; }
          .date-card.nights { background: #f0f9ff; border: 1px solid #bae6fd; }
          .date-card .dc-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px; }
          .date-card.checkin .dc-label { color: #16a34a; }
          .date-card.checkout .dc-label { color: #dc2626; }
          .date-card.nights .dc-label { color: #0284c7; }
          .date-card .dc-value { font-size: 15px; font-weight: 800; }
          .date-card.checkin .dc-value { color: #15803d; }
          .date-card.checkout .dc-value { color: #b91c1c; }
          .date-card.nights .dc-value { color: #0369a1; }

          .financial-table { width: 100%; border-collapse: collapse; }
          .financial-table tr td { padding: 8px 12px; font-size: 14px; }
          .financial-table tr:not(:last-child) td { border-bottom: 1px solid #f1f5f9; }
          .financial-table .total-row td { font-weight: 800; font-size: 15px; padding-top: 12px; border-top: 2px solid #e2e8f0 !important; }
          .financial-table td:last-child { text-align: right; font-weight: 600; }

          .guest-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
          .guest-row:last-child { border-bottom: none; }
          .guest-num { width: 26px; height: 26px; border-radius: 50%; background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
          .guest-name { font-size: 14px; font-weight: 600; color: #0f172a; }
          .guest-doc { font-size: 12px; color: #64748b; margin-top: 2px; }

          .rules-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; }
          .rules-box p { font-size: 13px; color: #92400e; line-height: 1.7; margin: 0; white-space: pre-wrap; }

          .checklist-room { margin-bottom: 18px; break-inside: avoid; }
          .room-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
          .room-header .room-icon { font-size: 18px; }
          .room-header .room-name { font-size: 14px; font-weight: 700; color: #0f172a; }
          .checklist-items { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
          .checklist-item { display: flex; align-items: center; gap: 6px; padding: 7px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #f1f5f9; }
          .checklist-item .ci-icon { font-size: 14px; }
          .checklist-item .ci-name { font-size: 12px; font-weight: 500; color: #334155; flex: 1; }
          .checklist-item .ci-qty { font-size: 11px; font-weight: 700; color: #64748b; background: #e2e8f0; border-radius: 999px; padding: 1px 7px; }
          .checklist-item .ci-check { width: 14px; height: 14px; border: 1.5px solid #cbd5e1; border-radius: 3px; flex-shrink: 0; }

          .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 16px; }
          .signature-block { text-align: center; }
          .signature-line { border-top: 1.5px solid #cbd5e1; margin-bottom: 8px; padding-top: 8px; }
          .signature-label { font-size: 12px; color: #64748b; }
          .signature-name { font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 2px; }

          .footer-note { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
        `}</style>

        {/* Header */}
        <div className="contract-header">
          <h1>Contrato de Reserva</h1>
          <p>{property.name} · {property.city}/{property.state}</p>
          <div className="code-badge">{code}</div>
        </div>

        {/* Property + Guest */}
        <div className="section">
          <p className="section-title">Imóvel & Responsável</p>
          <div className="info-grid">
            <div className="info-item">
              <div className="label">Imóvel</div>
              <div className="value">{property.name}</div>
            </div>
            <div className="info-item">
              <div className="label">Endereço</div>
              <div className="value">{property.address}, {property.city}/{property.state}</div>
            </div>
            <div className="info-item">
              <div className="label">Responsável</div>
              <div className="value">{res.guestName}</div>
            </div>
            <div className="info-item">
              <div className="label">Contato</div>
              <div className="value">{res.guestPhone || res.guestEmail || "—"}</div>
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="section">
          <p className="section-title">Período</p>
          <div className="dates-row">
            <div className="date-card checkin">
              <div className="dc-label">Check-in</div>
              <div className="dc-value">{fmtShort(res.checkIn)}</div>
              <div style={{ fontSize: 11, color: "#16a34a", marginTop: 3 }}>a partir das 14h</div>
            </div>
            <div className="date-card checkout">
              <div className="dc-label">Check-out</div>
              <div className="dc-value">{fmtShort(res.checkOut)}</div>
              <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 3 }}>até as 12h</div>
            </div>
            <div className="date-card nights">
              <div className="dc-label">Noites</div>
              <div className="dc-value">{res.nights}</div>
              <div style={{ fontSize: 11, color: "#0369a1", marginTop: 3 }}>{res.guestCount} hósp.</div>
            </div>
          </div>
        </div>

        {/* Financial */}
        <div className="section">
          <p className="section-title">Valores</p>
          <table className="financial-table">
            <tbody>
              <tr>
                <td style={{ color: "#64748b" }}>Hospedagem ({res.nights} noite{res.nights > 1 ? "s" : ""})</td>
                <td>{fmt(baseAmount)}</td>
              </tr>
              {Number(res.cleaningFee) > 0 && (
                <tr>
                  <td style={{ color: "#64748b" }}>Taxa de limpeza</td>
                  <td>{fmt(Number(res.cleaningFee))}</td>
                </tr>
              )}
              <tr className="total-row">
                <td>Total</td>
                <td style={{ color: "#1d4ed8" }}>{fmt(Number(res.totalAmount))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Guests */}
        {guests.length > 0 && (
          <div className="section">
            <p className="section-title">Hóspedes ({guests.length})</p>
            {guests.map((g, i) => (
              <div key={i} className="guest-row">
                <div className="guest-num">{i + 1}</div>
                <div>
                  <div className="guest-name">{g.name}</div>
                  <div className="guest-doc">
                    Nasc.: {g.birthDate ? new Date(g.birthDate).toLocaleDateString("pt-BR") : "—"} &nbsp;·&nbsp;
                    {g.docType}: {g.docNumber}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rules */}
        {property.rules && (
          <div className="section">
            <p className="section-title">Regras da Casa</p>
            <div className="rules-box">
              <p>{property.rules}</p>
            </div>
          </div>
        )}

        {/* Checklist / Inventário — Anexo I */}
        {checklist.length > 0 && (
          <div className="section" style={{ pageBreakBefore: "always" }}>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#4f46e5", margin: "0 0 4px" }}>ANEXO I</p>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>Inventário e Relação de Bens do Imóvel</p>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>{property.name} — Reserva {code}</p>
            </div>

            <div className="rules-box" style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: "#92400e" }}>
                Este Anexo faz parte integrante do Contrato de Locação. Os itens abaixo devem ser
                conferidos pelo hóspede no momento do check-in e check-out. Divergências devem ser
                comunicadas imediatamente ao administrador.
              </p>
            </div>

            {checklist.map((room, ri) => (
              <div key={ri} className="checklist-room">
                <div className="room-header">
                  <span className="room-icon">{ROOM_ICONS[room.type] || "📦"}</span>
                  <span className="room-name">{room.name}</span>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
                  <thead>
                    <tr style={{ background: "#eff6ff" }}>
                      <th style={{ textAlign: "left", fontSize: 10, fontWeight: 700, color: "#4f46e5", padding: "6px 10px", border: "1px solid #e2e8f0" }}>Item</th>
                      <th style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#4f46e5", padding: "6px 8px", border: "1px solid #e2e8f0", width: 50 }}>Qtd</th>
                      <th style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#4f46e5", padding: "6px 8px", border: "1px solid #e2e8f0", width: 60 }}>Unid.</th>
                      <th style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#4f46e5", padding: "6px 8px", border: "1px solid #e2e8f0", width: 70 }}>Check-in</th>
                      <th style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#4f46e5", padding: "6px 8px", border: "1px solid #e2e8f0", width: 80 }}>Check-out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {room.items.map((item, ii) => (
                      <tr key={ii} style={{ background: ii % 2 === 0 ? "#f8fafc" : "white" }}>
                        <td style={{ fontSize: 12, padding: "6px 10px", border: "1px solid #f1f5f9" }}>
                          <span style={{ marginRight: 6 }}>{item.icon}</span>{item.name}
                        </td>
                        <td style={{ textAlign: "center", fontSize: 12, fontWeight: 700, padding: "6px 8px", border: "1px solid #f1f5f9" }}>{item.quantity}</td>
                        <td style={{ textAlign: "center", fontSize: 11, color: "#64748b", padding: "6px 8px", border: "1px solid #f1f5f9" }}>{item.unit}</td>
                        <td style={{ textAlign: "center", fontSize: 18, padding: "4px 8px", border: "1px solid #f1f5f9" }}>☐</td>
                        <td style={{ textAlign: "center", fontSize: 18, padding: "4px 8px", border: "1px solid #f1f5f9" }}>☐</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Signature block for annex */}
            <div className="signature-grid" style={{ marginTop: 32 }}>
              <div className="signature-block">
                <div style={{ height: 40 }} />
                <div className="signature-line" />
                <div className="signature-label">Hóspede — Check-in</div>
                <div className="signature-name">{res.guestName}</div>
              </div>
              <div className="signature-block">
                <div style={{ height: 40 }} />
                <div className="signature-line" />
                <div className="signature-label">Administrador — Check-in</div>
              </div>
            </div>
            <div className="signature-grid" style={{ marginTop: 24 }}>
              <div className="signature-block">
                <div style={{ height: 40 }} />
                <div className="signature-line" />
                <div className="signature-label">Hóspede — Check-out</div>
                <div className="signature-name">{res.guestName}</div>
              </div>
              <div className="signature-block">
                <div style={{ height: 40 }} />
                <div className="signature-line" />
                <div className="signature-label">Administrador — Check-out</div>
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        {res.notes && (
          <div className="section">
            <p className="section-title">Observações</p>
            <div className="rules-box">
              <p>{res.notes}</p>
            </div>
          </div>
        )}

        {/* Signatures */}
        <div className="section" style={{ marginTop: 40 }}>
          <p className="section-title">Assinaturas</p>
          <p style={{ fontSize: 12, color: "#64748b", marginBottom: 20 }}>
            {property.city}, {fmtDate(res.createdAt)}
          </p>
          <div className="signature-grid">
            <div className="signature-block">
              <div style={{ height: 50 }} />
              <div className="signature-line" />
              <div className="signature-label">Hóspede Responsável</div>
              <div className="signature-name">{res.guestName}</div>
            </div>
            <div className="signature-block">
              <div style={{ height: 50 }} />
              <div className="signature-line" />
              <div className="signature-label">Locador / Administrador</div>
            </div>
          </div>
        </div>

        <div className="footer-note">
          Contrato gerado automaticamente · Reserva {code} · {property.name}
        </div>
      </div>
    </>
  );
}
