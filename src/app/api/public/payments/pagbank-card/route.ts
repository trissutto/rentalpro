import { beginPaymentAttempt, savePaymentAttempt, reconcilePayment, PaymentError } from "@/lib/payment-integrity";
import { authorizeGuestRequest } from "@/lib/guest-access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { limparToken } from "@/lib/pagbank";

const PB_API = "https://api.pagseguro.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, encryptedCard, holderName, holderCpf, installments = 1 } = body;

    if (!code || !encryptedCard || !holderName || !holderCpf) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

    const denied = await authorizeGuestRequest(req, String(code), "payments:write");
    if (denied) return denied;
    if (!Number.isInteger(Number(installments)) || Number(installments) < 1 || Number(installments) > 6) return NextResponse.json({ error: "Selecione entre 1 e 6 parcelas." }, { status: 400 });
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
    const token = limparToken(tokenSetting.value);

    const reqUrl = new URL(req.url);
    const isLocalhost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
    const origin = process.env.NEXT_PUBLIC_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

    const attempt = await beginPaymentAttempt(reservation.id, "pagbank", "card");
    const amountCents = attempt.amountCents;
    const numInstallments = Number(installments);

    const payload: Record<string, unknown> = {
      reference_id: reservation.code,
      description: `Reserva ${reservation.property.name} - ${reservation.code}`,
      amount: { value: amountCents, currency: "BRL" },
      payment_method: {
        type: "CREDIT_CARD",
        installments: numInstallments,
        capture: true,
        card: {
          encrypted: encryptedCard,
          store: false,
        },
        holder: {
          name: holderName,
          tax_id: holderCpf.replace(/\D/g, ""),
        },
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
        "x-idempotency-key": attempt.key,
      },
      body: JSON.stringify(payload),
    });

    const charge = await pbRes.json();
    if (!pbRes.ok) {
      console.error("PagBank card error:", "Gateway rejeitou a solicitação");
      const errObj = charge.error_messages?.[0];
      const msg = errObj
        ? `${errObj.description || "erro"} (${errObj.parameter_name || errObj.code || "unknown"})`
        : charge.description || "Cartao recusado";
      return NextResponse.json({ error: msg, pagbankStatus: charge.status, details: errObj }, { status: pbRes.status });
    }

    await savePaymentAttempt(reservation.id, attempt, charge.id);
    const { paymentStatus } = await reconcilePayment("pagbank", charge.id);

    return NextResponse.json({
      chargeId: charge.id,
      status: charge.status,
      paymentStatus,
      message: paymentStatus === "PAID"
        ? "Pagamento aprovado!"
        : paymentStatus === "PENDING"
          ? "Pagamento em análise"
          : paymentStatus === "REVIEW" ? "Pagamento recebido; a administração precisa conferir sua reserva." : "Pagamento recusado",
    });
  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("pagbank-card error:", err);
    return NextResponse.json({ error: "Erro interno ao processar cartão" }, { status: 500 });
  }
}
