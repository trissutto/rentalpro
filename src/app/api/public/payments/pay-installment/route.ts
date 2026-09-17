import { beginPaymentAttempt, savePaymentAttempt, reconcilePayment, PaymentError } from "@/lib/payment-integrity";
import { authorizeGuestRequest } from "@/lib/guest-access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { limparToken, montarCustomer, cpfValido } from "@/lib/pagbank";
import type { InstallmentPlan } from "../installment-plan/route";

const PB_API = "https://api.pagseguro.com";

/**
 * POST /api/public/payments/pay-installment
 * Body (PIX):  { code, seq, method: "pix" }
 * Body (Card): { code, seq, method: "card", encryptedCard, holderName, holderCpf }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, seq, method, encryptedCard, holderName, holderCpf, cpf } = body;

    if (!code || !seq || !method) {
      return NextResponse.json({ error: "code, seq e method são obrigatórios" }, { status: 400 });
    }

    const denied = await authorizeGuestRequest(req, String(code), "payments:write");
    if (denied) return denied;
    if (!["pix", "card"].includes(method) || !Number.isInteger(Number(seq)) || Number(seq) < 1) return NextResponse.json({ error: "Método ou parcela inválida" }, { status: 400 });
    if (method === "card" && (!encryptedCard || !holderName || !holderCpf)) return NextResponse.json({ error: "Dados do cartão obrigatórios" }, { status: 400 });
    // Load reservation
    const r = await prisma.reservation.findUnique({ where: { code: String(code).toUpperCase() }, include: { property: { select: { name: true } } } });
    if (!r) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    const propertyName = r.property.name;
    if (!r.installmentData) {
      return NextResponse.json({ error: "Nenhum plano de parcelamento encontrado" }, { status: 400 });
    }

    const plan: InstallmentPlan = JSON.parse(r.installmentData);
    const item = plan.items.find(i => i.seq === Number(seq));
    if (!item) return NextResponse.json({ error: "Parcela não encontrada" }, { status: 404 });
    if (item.paid) return NextResponse.json({ error: "Esta parcela já foi paga" }, { status: 409 });

    // Get PagBank token
    const tokenSetting = await prisma.setting.findUnique({ where: { key: "pagbank_token" } });
    if (!tokenSetting?.value) {
      return NextResponse.json({ error: "Gateway de pagamento não configurado" }, { status: 400 });
    }
    const token = limparToken(tokenSetting.value);

    const reqUrl = new URL(req.url);
    const isLocalhost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
    const origin = process.env.NEXT_PUBLIC_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

    if (method === "pix") {
      const document = typeof cpf === "string" ? cpf.replace(/\D/g, "") : r.guestCpf || "";
      if (!cpfValido(document)) return NextResponse.json({ error: "Informe um CPF válido antes de gerar o PIX.", precisaCpf: true }, { status: 400 });
      if (document !== r.guestCpf) { await prisma.reservation.update({ where: { id: r.id }, data: { guestCpf: document } }); r.guestCpf = document; }
    }
    const referenceId = `${r.code}-parcela-${seq}`;
    const attempt = await beginPaymentAttempt(r.id, "pagbank", String(method), Number(seq));
    const idempotencyKey = attempt.key;
    const amountCents = attempt.amountCents;

    let payload: Record<string, unknown>;

    let useOrdersApi = false;

    if (method === "pix") {
      // PIX uses /orders with qr_codes (NOT /charges)
      useOrdersApi = true;
      payload = {
        reference_id: referenceId,
        customer: montarCustomer(r),
        items: [
          {
            reference_id: referenceId,
            name: `${item.label} - Reserva ${r.code} (${propertyName})`,
            quantity: 1,
            unit_amount: amountCents,
          },
        ],
        qr_codes: [
          {
            expiration_date: new Date(Date.now() + 2 * 3600000).toISOString(),
            amount: { value: amountCents },
          },
        ],
        ...(isLocalhost ? {} : { notification_urls: [`${origin}/api/webhooks/pagbank`] }),
      };
    } else if (method === "card") {
      if (!encryptedCard || !holderName || !holderCpf) {
        return NextResponse.json({ error: "Dados do cartão obrigatórios" }, { status: 400 });
      }
      payload = {
        reference_id: referenceId,
        description: `${item.label} - Reserva ${r.code} (${propertyName})`,
        amount: { value: amountCents, currency: "BRL" },
        payment_method: {
          type: "CREDIT_CARD",
          installments: 1,
          capture: true,
          card: { encrypted: encryptedCard, store: false },
          holder: { name: holderName, tax_id: holderCpf.replace(/\D/g, "") },
        },
        ...(isLocalhost ? {} : { notification_urls: [`${origin}/api/webhooks/pagbank`] }),
      };
    } else {
      return NextResponse.json({ error: "Método de pagamento inválido" }, { status: 400 });
    }

    const apiUrl = useOrdersApi ? `${PB_API}/orders` : `${PB_API}/charges`;
    const pbRes = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const charge = await pbRes.json();
    if (!pbRes.ok) {
      console.error("pay-installment PagBank error:", "Gateway rejeitou a solicitação");
      const errObj = charge.error_messages?.[0];
      const msg = errObj
        ? `${errObj.description || "erro"} (param: ${errObj.parameter_name || "unknown"})`
        : charge.description || "Erro ao processar pagamento";
      return NextResponse.json({ error: msg }, { status: pbRes.status });
    }

    await savePaymentAttempt(r.id, attempt, charge.id, Number(seq));
    const { paymentStatus } = await reconcilePayment("pagbank", charge.id);
    const refreshed = await prisma.reservation.findUniqueOrThrow({ where: { id: r.id }, select: { installmentData: true } });
    const refreshedItem = JSON.parse(refreshed.installmentData || "{}").items?.find((part: { seq: number }) => part.seq === Number(seq));
    const approved = paymentStatus !== "REVIEW" && refreshedItem?.paid === true;
    const qrCode = useOrdersApi ? charge.qr_codes?.[0] : charge.payment_method?.qr_codes?.[0];
    return NextResponse.json({
      chargeId: charge.id,
      status: charge.status,
      paymentStatus,
      installmentPaid: approved,
      // PIX data
      pixText: qrCode?.text ?? null,
      pixImageLink: qrCode?.links?.find((l: any) => l.media === "image/png")?.href ?? null,
      pixExpiresAt: qrCode?.expiration_date ?? null,
    });
  } catch (e) {
    if (e instanceof PaymentError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("pay-installment error:", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
