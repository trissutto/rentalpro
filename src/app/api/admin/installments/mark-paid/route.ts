import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

/**
 * POST /api/admin/installments/mark-paid
 * Body: { code: string, seq: number, method?: string, notes?: string }
 *
 * Admin manually marks an installment as paid (no MP processing needed).
 * - Updates installmentData[seq].paid = true
 * - Creates a FinancialTransaction
 * - If all installments paid → sets reservation paymentStatus = PAID
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { code, seq, method = "Manual", notes } = await req.json();

    if (!code || !seq) {
      return NextResponse.json({ error: "code e seq são obrigatórios" }, { status: 400 });
    }

    // Load reservation
    const rows: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT r.id, r.code, r.guestName, r.propertyId, r.totalAmount, r.paymentStatus, r.installmentData,
              p.name as propertyName
       FROM reservations r
       JOIN properties p ON r.propertyId = p.id
       WHERE r.code = ?`,
      String(code).toUpperCase()
    );

    if (!rows.length) {
      return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    }
    const r = rows[0];

    if (!r.installmentData) {
      return NextResponse.json({ error: "Nenhum plano de parcelamento encontrado" }, { status: 400 });
    }

    let plan: any;
    try { plan = JSON.parse(r.installmentData); } catch {
      return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
    }

    const item = plan.items?.find((i: any) => i.seq === Number(seq));
    if (!item) {
      return NextResponse.json({ error: `Parcela ${seq} não encontrada` }, { status: 404 });
    }
    if (item.paid) {
      return NextResponse.json({ error: "Esta parcela já está paga" }, { status: 409 });
    }

    // Mark installment as paid
    const now = new Date().toISOString();
    item.paid = true;
    item.paidAt = now;
    item.paymentMethod = method;
    if (notes) item.notes = notes;

    // Check if ALL paid
    const allPaid = plan.items.every((i: any) => i.paid);

    // Update reservation
    await (prisma as any).$executeRawUnsafe(
      `UPDATE reservations
       SET installmentData = ?,
           paymentStatus = ?,
           paymentMethod = ?,
           paidAt = ?
       WHERE id = ?`,
      JSON.stringify(plan),
      allPaid ? "PAID" : "PARTIAL",
      `Parcelado (${plan.numInstallments}x)`,
      allPaid ? now : null,
      r.id
    );

    if (allPaid) {
      await prisma.reservation.update({
        where: { id: r.id },
        data: { status: "CONFIRMED" },
      });
    }

    // Create financial transaction
    await prisma.financialTransaction.create({
      data: {
        reservationId: r.id,
        propertyId: r.propertyId,
        type: "INCOME",
        category: "INSTALLMENT",
        description: `${item.label} — ${r.code} (${r.guestName}) — ${method}${notes ? ` — ${notes}` : ""}`,
        amount: Number(item.amount),
        isPaid: true,
        paidAt: new Date(),
        createdById: user.id,
      },
    });

    return NextResponse.json({ ok: true, allPaid, item });
  } catch (err) {
    console.error("mark-paid error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
