import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

/**
 * POST /api/reservations/[id]/confirm-payment
 * Body: { method: string, notes?: string, amount?: number }
 *
 * Confirms a manual payment (bank transfer, PIX, cash, etc.)
 * - Updates reservation paymentStatus to PAID
 * - Creates a FinancialTransaction (INCOME / RESERVATION_INCOME)
 * - Confirms the reservation if still PENDING
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { method, notes, amount } = body;

    if (!method) {
      return NextResponse.json({ error: "Método de pagamento é obrigatório" }, { status: 400 });
    }

    // Load reservation
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: { property: { select: { name: true } } },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    }

    if (reservation.paymentStatus === "PAID") {
      return NextResponse.json({ error: "Reserva já está marcada como paga" }, { status: 409 });
    }

    const paymentAmount = amount ? Number(amount) : Number(reservation.totalAmount);
    const now = new Date();

    // Update reservation payment status
    const updated = await prisma.reservation.update({
      where: { id: params.id },
      data: {
        paymentStatus: "PAID",
        paymentMethod: method,
        paidAt: now,
        ...(reservation.status === "PENDING" ? { status: "CONFIRMED" } : {}),
      },
      include: {
        property: { include: { owner: { select: { id: true, name: true } } } },
        cleaning: { include: { cleaner: true } },
        transactions: true,
        guests: true,
      },
    });

    // Create financial transaction if it doesn't already exist
    const existing = await prisma.financialTransaction.findFirst({
      where: {
        reservationId: reservation.id,
        category: "RESERVATION_INCOME",
        isPaid: true,
      },
    });

    if (!existing) {
      await prisma.financialTransaction.create({
        data: {
          reservationId: reservation.id,
          propertyId: reservation.propertyId,
          type: "INCOME",
          category: "RESERVATION_INCOME",
          description: `Reserva ${reservation.code} — ${reservation.guestName} (${method})${notes ? ` — ${notes}` : ""}`,
          amount: paymentAmount,
          isPaid: true,
          paidAt: now,
          createdById: user.id,
        },
      });
    }

    // Mark receipt as approved
    try {
      await (prisma as any).$executeRawUnsafe(
        `UPDATE reservations SET receiptStatus = 'APPROVED' WHERE id = ?`, params.id
      );
    } catch { /* column may not exist on older DBs */ }

    return NextResponse.json({ reservation: { ...updated, receiptStatus: "APPROVED" } });
  } catch (err) {
    console.error("confirm-payment error:", err);
    return NextResponse.json({ error: "Erro ao confirmar pagamento" }, { status: 500 });
  }
}
