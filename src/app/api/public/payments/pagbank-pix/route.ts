import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, pixEmailHtml } from "@/lib/email";

const PB_API = "https://api.pagseguro.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = body;
    if (!code) return NextResponse.json({ error: "Código da reserva obrigatório" }, { status: 400 });

    // Load reservation
    const reservation = await prisma.reservation.findUnique({
      where: { code: String(code).toUpperCase() },
      include: { property: { select: { name: true } } },
    });
    if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    if (reservation.paymentStatus === "PAID") {
      return NextResponse.json({ error: "Esta reserva já foi paga" }, { status: 409 });
    }

    // Get PagBank token
    const tokenSetting = await prisma.setting.findUnique({ where: { key: "pagbank_token" } });
    if (!tokenSetting?.value) {
      return NextResponse.json({ error: "Gateway de pagamento não configurado" }, { status: 400 });
    }
    const token = tokenSetting.value.trim();

    const reqUrl = new URL(req.url);
    const isLocalhost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
    const origin = process.env.NEXT_PUBLIC_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

    const amountCents = Math.round(Number(reservation.totalAmount) * 100);

    const payload: Record<string, unknown> = {
      reference_id: reservation.code,
      description: `Reserva ${reservation.property.name} - ${reservation.code}`,
      amount: { value: amountCents, currency: "BRL" },
      payment_method: {
        type: "PIX",
      },
      ...(isLocalhost ? {} : {
        notification_urls: [`${origin}/api/webhooks/pagbank`],
      }),
    };

    const pbRes = await fetch(`${PB_API}/charges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "x-idempotency-key": `${reservation.code}-pix-${Date.now()}`,
      },
      body: JSON.stringify(payload),
    });

    const charge = await pbRes.json();
    if (!pbRes.ok) {
      console.error("PagBank PIX error:", JSON.stringify(charge));
      const errObj = charge.error_messages?.[0];
      const msg = errObj
        ? `${errObj.description || "erro"} (${errObj.parameter_name || "unknown"})`
        : charge.description || "Erro ao gerar PIX";
      return NextResponse.json({ error: msg }, { status: pbRes.status });
    }

    // PagBank PIX response: charge.payment_method.qr_codes[0]
    const qrCode = charge.payment_method?.qr_codes?.[0];
    const pixText = qrCode?.text ?? null;
    const pixImageLink = qrCode?.links?.find((l: any) => l.media === "image/png")?.href ?? null;
    const expiresAt = qrCode?.expiration_date ?? null;

    // Store charge ID on reservation
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { mpPaymentId: charge.id, paymentMethod: "PIX" },
    });

    // Send PIX email
    if (reservation.guestEmail && pixText) {
      try {
        const smtpSettings = await prisma.setting.findMany({
          where: { key: { in: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"] } },
        });
        const smtp = Object.fromEntries(smtpSettings.map(s => [s.key, s.value]));
        if (smtp.smtp_host && smtp.smtp_user && smtp.smtp_pass) {
          const html = pixEmailHtml({
            guestName: reservation.guestName,
            propertyName: reservation.property.name,
            checkIn: reservation.checkIn.toISOString(),
            checkOut: reservation.checkOut.toISOString(),
            nights: reservation.nights,
            totalAmount: Number(reservation.totalAmount),
            reservationCode: reservation.code,
            pixCode: pixText,
            pixQrBase64: null,
            expiresAt,
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
      } catch (e) {
        console.error("Erro ao enviar email PIX:", e);
      }
    }

    return NextResponse.json({
      chargeId: charge.id,
      status: charge.status,
      pixText,
      pixImageLink,
      expiresAt,
    });
  } catch (err) {
    console.error("pagbank-pix error:", err);
    return NextResponse.json({ error: "Erro interno ao gerar PIX" }, { status: 500 });
  }
}
