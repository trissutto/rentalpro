import { beginPaymentAttempt, savePaymentAttempt, reconcilePayment, PaymentError } from "@/lib/payment-integrity";
import { authorizeGuestRequest } from "@/lib/guest-access";
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

    const denied = await authorizeGuestRequest(req, String(code), "payments:write");
    if (denied) return denied;
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

    const attempt = await beginPaymentAttempt(reservation.id, "mercadopago", String(formData.payment_method_id));
    // Build payment payload — merge brick formData with reservation data
    const paymentPayload = {
      token: formData.token,
      payment_method_id: formData.payment_method_id,
      issuer_id: formData.issuer_id,
      installments: Math.max(1, Math.min(12, Number(formData.installments) || 1)),
      payer: formData.payer,
      transaction_amount: attempt.amountCents / 100,
      description: `Reserva ${reservation.property.name} — ${reservation.code}`,
      external_reference: reservation.code,
      // Only set notification_url in production (requires public HTTPS)
      ...(isLocalhost ? {} : { notification_url: `${origin}/api/webhooks/mercadopago` }),
    };

    // Idempotency key prevents duplicate charges on retry
    const idempotencyKey = attempt.key;

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
      console.error("MP payment error:", "Gateway rejeitou a solicitação");
      return NextResponse.json(
        { error: payment.message || payment.cause?.[0]?.description || "Erro ao processar pagamento" },
        { status: mpRes.status }
      );
    }

    await savePaymentAttempt(reservation.id, attempt, String(payment.id));
    const { paymentStatus } = await reconcilePayment("mercadopago", String(payment.id));

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
    return NextResponse.json({ id: payment.id, status: paymentStatus === "PAID" ? "approved" : paymentStatus === "FAILED" ? "rejected" : "pending", paymentStatus, point_of_interaction: payment.point_of_interaction });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Erro no processamento de pagamento:", err);
    return NextResponse.json({ error: "Erro interno ao processar pagamento" }, { status: 500 });
  }
}
