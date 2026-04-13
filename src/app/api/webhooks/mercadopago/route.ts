import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // MP sends different notification types
    const { type, data, action } = body;

    // Only process payment notifications
    if (type !== "payment" && action !== "payment.created" && action !== "payment.updated") {
      return NextResponse.json({ received: true });
    }

    const paymentId = data?.id;
    if (!paymentId) return NextResponse.json({ received: true });

    // Get MP access token
    const tokenSetting = await prisma.setting.findUnique({ where: { key: "mp_access_token" } });
    if (!tokenSetting?.value) return NextResponse.json({ received: true });

    // Fetch payment details from MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${tokenSetting.value}` },
    });
    const payment = await mpRes.json();

    if (!mpRes.ok) {
      console.error("MP webhook: could not fetch payment", payment);
      return NextResponse.json({ received: true });
    }

    const externalRef = payment.external_reference; // reservation code
    if (!externalRef) return NextResponse.json({ received: true });

    const reservation = await prisma.reservation.findUnique({
      where: { code: externalRef },
    });
    if (!reservation) return NextResponse.json({ received: true });

    // Map MP payment status to our status
    const statusMap: Record<string, string> = {
      approved: "PAID",
      pending: "PENDING",
      in_process: "PENDING",
      rejected: "FAILED",
      cancelled: "FAILED",
      refunded: "REFUNDED",
      charged_back: "REFUNDED",
    };

    const paymentStatus = statusMap[payment.status] || "PENDING";
    const paymentMethod = payment.payment_type_id === "credit_card"
      ? `Cartão de Crédito (${payment.installments}x)`
      : payment.payment_type_id === "pix"
        ? "PIX"
        : payment.payment_type_id || "Outro";

    // Update reservation — on PAID: confirm it so it blocks the calendar
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        paymentStatus,
        paymentMethod,
        mpPaymentId: String(paymentId),
        paidAt: paymentStatus === "PAID" ? new Date() : undefined,
        // Promote to CONFIRMED when payment is approved → blocks calendar
        ...(paymentStatus === "PAID" && reservation.status === "PENDING"
          ? { status: "CONFIRMED" }
          : {}),
        // Revert to PENDING if payment failed (undo any premature confirmation)
        ...(paymentStatus === "FAILED" && reservation.status === "CONFIRMED"
          ? { status: "PENDING" }
          : {}),
      },
    });

    // Create financial transaction on payment approval
    if (paymentStatus === "PAID") {
      // Check if transaction already exists for this payment
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
      } else {
        // Update existing to paid
        await prisma.financialTransaction.update({
          where: { id: existing.id },
          data: { isPaid: true, paidAt: new Date() },
        });
      }
    }

    console.log(`Webhook MP: reserva ${externalRef} → ${paymentStatus} via ${paymentMethod}`);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook MP error:", err);
    // Return 200 so MP doesn't retry
    return NextResponse.json({ received: true });
  }
}

// MP also sends GET to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
