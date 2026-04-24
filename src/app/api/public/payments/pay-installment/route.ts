import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
    const { code, seq, method, encryptedCard, holderName, holderCpf } = body;

    if (!code || !seq || !method) {
      return NextResponse.json({ error: "code, seq e method são obrigatórios" }, { status: 400 });
    }

    // Load reservation
    const rows: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT id, code, guestName, guestEmail, checkIn, checkOut, nights,
              totalAmount, cleaningFee, propertyId, paymentStatus, installmentData
       FROM reservations WHERE code = ?`,
      String(code).toUpperCase()
    );
    if (!rows.length) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    const r = rows[0];

    const propRows: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT name FROM properties WHERE id = ?`, r.propertyId
    );
    const propertyName = propRows[0]?.name || "Imóvel";

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
    const token = tokenSetting.value.trim();

    const reqUrl = new URL(req.url);
    const isLocalhost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
    const origin = process.env.NEXT_PUBLIC_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

    const amountCents = Math.round(item.amount * 100);
    const referenceId = `${r.code}-parcela-${seq}`;
    const idempotencyKey = `${r.code}-inst-${seq}-${Date.now()}`;

    let payload: Record<string, unknown>;

    let useOrdersApi = false;

    if (method === "pix") {
      // PIX uses /orders with qr_codes (NOT /charges)
      useOrdersApi = true;
      payload = {
        reference_id: referenceId,
        customer: {
          name: r.guestName || "Hospede",
          email: r.guestEmail || "guest@reserva.com",
        },
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
      console.error("pay-installment PagBank error:", JSON.stringify(charge));
      const errObj = charge.error_messages?.[0];
      const msg = errObj
        ? `${errObj.description || "erro"} (param: ${errObj.parameter_name || "unknown"})`
        : charge.description || "Erro ao processar pagamento";
      return NextResponse.json({ error: msg }, { status: pbRes.status });
    }

    // For PIX orders, get status from charges array; for card charges, use direct status
    const pbStatus = (useOrdersApi ? charge.charges?.[0]?.status : charge.status) as string;
    const approvedStatuses = ["PAID", "AVAILABLE", "AUTHORIZED"];
    const approved = approvedStatuses.includes(pbStatus);

    // For PIX orders: qr_codes is at top level; for charges: inside payment_method
    const qrCode = useOrdersApi
      ? charge.qr_codes?.[0]
      : charge.payment_method?.qr_codes?.[0];

    if (approved) {
      item.paid = true;
      item.paidAt = new Date().toISOString();
      item.mpPaymentId = charge.id;

      const allPaid = plan.items.every(i => i.paid);

      await (prisma as any).$executeRawUnsafe(
        `UPDATE reservations SET installmentData = ?,
          paymentStatus = ?,
          paymentMethod = ?,
          paidAt = ?
         WHERE id = ?`,
        JSON.stringify(plan),
        allPaid ? "PAID" : "PARTIAL",
        method === "pix" ? "PIX Parcelado" : `Cartão Parcelado`,
        allPaid ? new Date().toISOString() : null,
        r.id
      );

      await prisma.financialTransaction.create({
        data: {
          reservationId: r.id,
          propertyId: r.propertyId,
          type: "INCOME",
          category: "INSTALLMENT",
          description: `${item.label} - ${r.code} (${propertyName})`,
          amount: item.amount,
          isPaid: true,
          paidAt: new Date(),
        },
      });

      if (allPaid) {
        await prisma.reservation.update({
          where: { id: r.id },
          data: { status: "CONFIRMED" },
        });
      }
    }

    return NextResponse.json({
      chargeId: charge.id,
      status: charge.status,
      installmentPaid: approved,
      // PIX data
      pixText: qrCode?.text ?? null,
      pixImageLink: qrCode?.links?.find((l: any) => l.media === "image/png")?.href ?? null,
      pixExpiresAt: qrCode?.expiration_date ?? null,
    });
  } catch (e) {
    console.error("pay-installment error:", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
