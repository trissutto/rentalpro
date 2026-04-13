import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, pixEmailHtml } from "@/lib/email";

// Processes a payment from the MP Payment Brick (transparent checkout)
// formData comes directly from the brick's onSubmit callback
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, formData } = body;

    if (!code || !formData) {
      return NextResponse.json({ error: "Dados obrigatórios ausentes" }, { status: 400 });
    }

    // Get reservation
    const reservation = await prisma.reservation.findUnique({
      where: { code: String(code).toUpperCase() },
      include: { property: { select: { name: true } } },
    });
    if (!reservation) {
      return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    }
    if (reservation.paymentStatus === "PAID") {
      return NextResponse.json({ error: "Esta reserva já foi paga" }, { status: 409 });
    }

    // Get MP access token
    let tokenSetting = null;
    try {
      tokenSetting = await prisma.setting.findUnique({ where: { key: "mp_access_token" } });
    } catch {
      return NextResponse.json({ error: "Configuração de pagamento não encontrada" }, { status: 500 });
    }
    if (!tokenSetting?.value) {
      return NextResponse.json({ error: "Gateway de pagamento não configurado" }, { status: 400 });
    }

    const accessToken = tokenSetting.value.trim();
    const reqUrl = new URL(req.url);
    const isLocalhost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
    const origin = process.env.NEXT_PUBLIC_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

    // Build payment payload — merge brick formData with reservation data
    const paymentPayload = {
      ...formData,
      transaction_amount: Number(reservation.totalAmount),
      description: `Reserva ${reservation.property.name} — ${reservation.code}`,
      external_reference: reservation.code,
      // Only set notification_url in production (requires public HTTPS)
      ...(isLocalhost ? {} : { notification_url: `${origin}/api/webhooks/mercadopago` }),
    };

    // Idempotency key prevents duplicate charges on retry
    const idempotencyKey = `${reservation.code}-${formData.payment_method_id}-${Date.now()}`;

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const payment = await mpRes.json();

    if (!mpRes.ok) {
      console.error("MP payment error:", JSON.stringify(payment));
      return NextResponse.json(
        { error: payment.message || payment.cause?.[0]?.description || "Erro ao processar pagamento" },
        { status: mpRes.status }
      );
    }

    // Map payment status
    const statusMap: Record<string, string> = {
      approved: "PAID",
      pending: "PENDING",
      in_process: "PENDING",
      rejected: "FAILED",
      cancelled: "FAILED",
    };
    const paymentStatus = statusMap[payment.status] || "PENDING";

    const paymentMethod = payment.payment_type_id === "credit_card"
      ? `Cartão de Crédito (${payment.installments}x)`
      : payment.payment_type_id === "bank_transfer"
        ? "PIX"
        : payment.payment_type_id === "debit_card"
          ? "Cartão de Débito"
          : payment.payment_method_id || "Outro";

    // Update reservation
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        mpPaymentId: String(payment.id),
        paymentStatus,
        paymentMethod,
        paidAt: paymentStatus === "PAID" ? new Date() : undefined,
        ...(paymentStatus === "PAID" && reservation.status === "PENDING"
          ? { status: "CONFIRMED" }
          : {}),
      },
    });

    // Create financial transaction if paid
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

    // Send PIX email if payment method is bank_transfer (PIX) and guest has email
    if (
      payment.payment_type_id === "bank_transfer" &&
      reservation.guestEmail &&
      payment.point_of_interaction?.transaction_data?.qr_code
    ) {
      try {
        // Get SMTP settings
        const smtpSettings = await prisma.setting.findMany({
          where: { key: { in: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"] } },
        });
        const smtp = Object.fromEntries(smtpSettings.map(s => [s.key, s.value]));

        if (smtp.smtp_host && smtp.smtp_user && smtp.smtp_pass) {
          const txData = payment.point_of_interaction.transaction_data;
          const html = pixEmailHtml({
            guestName: reservation.guestName,
            propertyName: reservation.property.name,
            checkIn: reservation.checkIn.toISOString(),
            checkOut: reservation.checkOut.toISOString(),
            nights: reservation.nights,
            totalAmount: Number(reservation.totalAmount),
            reservationCode: reservation.code,
            pixCode: txData.qr_code,
            pixQrBase64: txData.qr_code_base64,
            expiresAt: payment.date_of_expiration,
          });

          await sendMail({
            host: smtp.smtp_host,
            port: Number(smtp.smtp_port) || 465,
            user: smtp.smtp_user,
            pass: smtp.smtp_pass,
            from: smtp.smtp_from || smtp.smtp_user,
            to: reservation.guestEmail,
            subject: `🏠 PIX para confirmar sua reserva — ${reservation.property.name}`,
            html,
          });
        }
      } catch (emailErr) {
        // Email failure should not fail the payment
        console.error("Erro ao enviar email PIX:", emailErr);
      }
    }

    // Return full MP payment response (brick uses it to show QR code for PIX)
    return NextResponse.json(payment);
  } catch (err) {
    console.error("Erro no processamento de pagamento:", err);
    return NextResponse.json({ error: "Erro interno ao processar pagamento" }, { status: 500 });
  }
}
