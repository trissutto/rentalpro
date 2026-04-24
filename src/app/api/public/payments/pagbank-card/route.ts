import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PB_API = "https://api.pagseguro.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, encryptedCard, holderName, holderCpf, installments = 1 } = body;

    if (!code || !encryptedCard || !holderName || !holderCpf) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }

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
    const numInstallments = Math.max(1, Math.min(12, Number(installments)));

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
        "x-idempotency-key": `${reservation.code}-card-${Date.now()}`,
      },
      body: JSON.stringify(payload),
    });

    const charge = await pbRes.json();
    if (!pbRes.ok) {
      console.error("PagBank card error:", JSON.stringify(charge));
      const errObj = charge.error_messages?.[0];
      const msg = errObj
        ? `${errObj.description || "erro"} (${errObj.parameter_name || errObj.code || "unknown"})`
        : charge.description || "Cartao recusado";
      return NextResponse.json({ error: msg, pagbankStatus: charge.status, details: errObj }, { status: pbRes.status });
    }

    // Check if charge was declined
    if (charge.status === "DECLINED" || charge.status === "CANCELED") {
      const reason = charge.payment_response?.message || "Pagamento recusado pela operadora";
      const code = charge.payment_response?.code || "";
      return NextResponse.json({
        error: `${reason}${code ? ` (${code})` : ""}`,
        chargeId: charge.id,
        status: charge.status,
        paymentStatus: "FAILED",
        message: reason,
      });
    }

    // Map PagBank status → internal status
    const statusMap: Record<string, string> = {
      PAID: "PAID",
      AVAILABLE: "PAID",
      AUTHORIZED: "PAID",
      IN_ANALYSIS: "PENDING",
      WAITING: "PENDING",
      DECLINED: "FAILED",
      CANCELED: "FAILED",
    };
    const paymentStatus = statusMap[charge.status] || "PENDING";
    const installLabel = numInstallments > 1
      ? `Cartão de Crédito (${numInstallments}x)`
      : "Cartão de Crédito";

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        mpPaymentId: charge.id,
        paymentStatus,
        paymentMethod: installLabel,
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
            description: `Reserva ${reservation.code} - ${reservation.guestName} (${installLabel})`,
            amount: Number(reservation.totalAmount),
            isPaid: true,
            paidAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json({
      chargeId: charge.id,
      status: charge.status,
      paymentStatus,
      message: paymentStatus === "PAID"
        ? "Pagamento aprovado!"
        : paymentStatus === "PENDING"
          ? "Pagamento em análise"
          : "Pagamento recusado",
    });
  } catch (err) {
    console.error("pagbank-card error:", err);
    return NextResponse.json({ error: "Erro interno ao processar cartão" }, { status: 500 });
  }
}
