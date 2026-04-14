import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { InstallmentPlan } from "../installment-plan/route";

/**
 * POST /api/public/payments/pay-installment
 * Body: { code: string, seq: number, formData: MP brick formData }
 *
 * Processes payment for a specific installment (seq 1 = entry, 2..n = monthly).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, seq, formData } = body;

    if (!code || !seq || !formData) {
      return NextResponse.json({ error: "code, seq e formData são obrigatórios" }, { status: 400 });
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

    // Load property name
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

    // Get MP token
    const tokenSetting = await prisma.setting.findUnique({ where: { key: "mp_access_token" } });
    if (!tokenSetting?.value) {
      return NextResponse.json({ error: "Gateway de pagamento não configurado" }, { status: 400 });
    }

    const accessToken = tokenSetting.value.trim();
    const reqUrl = new URL(req.url);
    const isLocalhost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";
    const origin = process.env.NEXT_PUBLIC_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

    const paymentPayload = {
      ...formData,
      transaction_amount: item.amount,
      description: `${item.label} — Reserva ${r.code} (${propertyName})`,
      external_reference: `${r.code}-parcela-${seq}`,
      ...(isLocalhost ? {} : { notification_url: `${origin}/api/webhooks/mercadopago` }),
    };

    const idempotencyKey = `${r.code}-inst-${seq}-${Date.now()}`;

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const payment = await mpRes.json();
    if (!mpRes.ok) {
      return NextResponse.json(
        { error: payment.message || "Erro ao processar pagamento" },
        { status: mpRes.status }
      );
    }

    const approved = payment.status === "approved";

    if (approved) {
      // Mark installment as paid
      item.paid = true;
      item.paidAt = new Date().toISOString();
      item.mpPaymentId = String(payment.id);

      // Check if ALL installments are paid
      const allPaid = plan.items.every(i => i.paid);

      await (prisma as any).$executeRawUnsafe(
        `UPDATE reservations SET installmentData = ?,
          paymentStatus = ?,
          paymentMethod = ?,
          paidAt = ?
         WHERE id = ?`,
        JSON.stringify(plan),
        allPaid ? "PAID" : "PARTIAL",
        `Parcelado (${plan.numInstallments}x)`,
        allPaid ? new Date().toISOString() : null,
        r.id
      );

      // Create financial transaction for this installment
      await prisma.financialTransaction.create({
        data: {
          reservationId: r.id,
          propertyId: r.propertyId,
          type: "INCOME",
          category: "INSTALLMENT",
          description: `${item.label} — ${r.code} (${propertyName})`,
          amount: item.amount,
          isPaid: true,
          paidAt: new Date(),
        },
      });

      // If all paid, confirm reservation
      if (allPaid) {
        await prisma.reservation.update({
          where: { id: r.id },
          data: { status: "CONFIRMED" },
        });
      }
    }

    // Return MP response (for PIX QR code if needed)
    return NextResponse.json({ ...payment, installmentPaid: approved });
  } catch (e) {
    console.error("pay-installment error:", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
