import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PB_API = "https://api.pagseguro.com";

// Map PagBank charge status → internal payment status
const STATUS_MAP: Record<string, string> = {
  PAID: "PAID",
  AVAILABLE: "PAID",
  AUTHORIZED: "PAID",
  IN_ANALYSIS: "PENDING",
  WAITING: "PENDING",
  DECLINED: "FAILED",
  CANCELED: "FAILED",
  REFUNDED: "REFUNDED",
  IN_DISPUTE: "PENDING",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // PagBank sends: { id: "CHAR_...", reference_id: "...", type: "charge", status: "PAID" }
    // Or: { id: "CHAR_...", type: "charge.status.changed" }
    const chargeId = body.id || body.data?.id;
    if (!chargeId) return NextResponse.json({ received: true });

    // Get PagBank token to fetch charge details
    const tokenSetting = await prisma.setting.findUnique({ where: { key: "pagbank_token" } });
    if (!tokenSetting?.value) return NextResponse.json({ received: true });

    // Fetch charge from PagBank to get the latest status
    const pbRes = await fetch(`${PB_API}/charges/${chargeId}`, {
      headers: { "Authorization": `Bearer ${tokenSetting.value.trim()}` },
    });
    if (!pbRes.ok) {
      console.error("PagBank webhook: could not fetch charge", chargeId);
      return NextResponse.json({ received: true });
    }
    const charge = await pbRes.json();

    const referenceId = charge.reference_id; // reservation code or "code-parcela-N"
    if (!referenceId) return NextResponse.json({ received: true });

    const pbStatus = charge.status as string;
    const paymentStatus = STATUS_MAP[pbStatus] || "PENDING";

    // Check if this is an installment payment (format: "CODE-parcela-N")
    const installmentMatch = referenceId.match(/^(.+)-parcela-(\d+)$/);

    if (installmentMatch) {
      // Installment payment
      const reservationCode = installmentMatch[1].toUpperCase();
      const seq = Number(installmentMatch[2]);

      const reservation = await prisma.reservation.findUnique({
        where: { code: reservationCode },
      });
      if (!reservation || !reservation.installmentData) {
        return NextResponse.json({ received: true });
      }

      if (paymentStatus === "PAID") {
        const plan = JSON.parse(reservation.installmentData as string);
        const item = plan.items.find((i: any) => i.seq === seq);
        if (item && !item.paid) {
          item.paid = true;
          item.paidAt = new Date().toISOString();
          item.mpPaymentId = chargeId;

          const allPaid = plan.items.every((i: any) => i.paid);

          await prisma.reservation.update({
            where: { id: reservation.id },
            data: {
              installmentData: JSON.stringify(plan),
              paymentStatus: allPaid ? "PAID" : "PARTIAL",
              paidAt: allPaid ? new Date() : undefined,
              ...(allPaid ? { status: "CONFIRMED" } : {}),
            },
          });

          await prisma.financialTransaction.create({
            data: {
              reservationId: reservation.id,
              propertyId: reservation.propertyId,
              type: "INCOME",
              category: "INSTALLMENT",
              description: `${item.label} — ${reservationCode}`,
              amount: item.amount,
              isPaid: true,
              paidAt: new Date(),
            },
          });
        }
      }
    } else {
      // Full payment
      const reservation = await prisma.reservation.findUnique({
        where: { code: referenceId.toUpperCase() },
      });
      if (!reservation) return NextResponse.json({ received: true });

      const paymentMethod = charge.payment_method?.type === "CREDIT_CARD"
        ? `Cartão de Crédito (${charge.payment_method.installments || 1}x)`
        : "PIX";

      await prisma.reservation.update({
        where: { id: reservation.id },
        data: {
          mpPaymentId: chargeId,
          paymentStatus,
          paymentMethod,
          paidAt: paymentStatus === "PAID" ? new Date() : undefined,
          ...(paymentStatus === "PAID" && reservation.status === "PENDING"
            ? { status: "CONFIRMED" }
            : {}),
          ...(paymentStatus === "FAILED" && reservation.status === "CONFIRMED"
            ? { status: "PENDING" }
            : {}),
        },
      });

      if (paymentStatus === "PAID") {
        const existing = await prisma.financialTransaction.findFirst({
          where: { reservationId: reservation.id, category: "RESERVATION_INCOME" },
        });
        if (!existing) {
          await prisma.financialTransaction.create({
            data: {
              reservationId: reservation.id,
              propertyId: reservation.propertyId,
              type: "INCOME",
              category: "RESERVATION_INCOME",
              description: `Reserva ${reservation.code} — ${reservation.guestName} (${paymentMethod})`,
              amount: Number(reservation.totalAmount),
              isPaid: true,
              paidAt: new Date(),
            },
          });
        }
      }
    }

    console.log(`Webhook PagBank: ${referenceId} → ${paymentStatus}`);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook PagBank error:", err);
    return NextResponse.json({ received: true });
  }
}

// PagBank may GET to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
