import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhooks/pagarme
 *
 * Confirma o pagamento por CARTÃO. O Pagar.me avisa aqui quando o pedido muda
 * de estado; ligamos ao imóvel pelo `code`, que mandamos como referência ao
 * criar o link (e guardamos o id do pedido na reserva como reserva técnica).
 *
 * Sempre respondemos 200: erro nosso não pode fazer o Pagar.me reenviar em
 * laço. O que não deu para tratar fica no log.
 */
const STATUS_PAGO = ["paid", "captured"];
const STATUS_FALHOU = ["failed", "canceled", "refused", "chargedback"];

export async function POST(req: NextRequest) {
  try {
    const evento = await req.json();

    const pedido = evento?.data ?? {};
    const status = String(pedido?.status ?? "").toLowerCase();
    const referencia = String(pedido?.code ?? "").toUpperCase();
    const pedidoId = String(pedido?.id ?? "");

    if (!referencia && !pedidoId) {
      return NextResponse.json({ received: true });
    }

    const reserva = referencia
      ? await prisma.reservation.findUnique({ where: { code: referencia } })
      : await prisma.reservation.findFirst({ where: { mpPaymentId: pedidoId } });

    if (!reserva) {
      console.warn("[pagarme] evento sem reserva correspondente:", referencia || pedidoId);
      return NextResponse.json({ received: true });
    }

    if (!STATUS_PAGO.includes(status)) {
      if (STATUS_FALHOU.includes(status) && reserva.status === "CONFIRMED") {
        await prisma.reservation.update({
          where: { id: reserva.id },
          data: { paymentStatus: "FAILED", status: "PENDING" },
        });
      }
      return NextResponse.json({ received: true });
    }

    // Quantas parcelas o hóspede escolheu, para registrar junto
    const parcelas =
      pedido?.charges?.[0]?.last_transaction?.installments ??
      pedido?.charges?.[0]?.installments ??
      1;

    await prisma.reservation.update({
      where: { id: reserva.id },
      data: {
        mpPaymentId: pedidoId || reserva.mpPaymentId,
        paymentStatus: "PAID",
        paymentMethod: `Cartão de Crédito (${parcelas}x)`,
        paidAt: new Date(),
        ...(reserva.status === "PENDING" ? { status: "CONFIRMED" } : {}),
      },
    });

    // O Pagar.me pode reenviar o mesmo evento — sem esta checagem a reserva
    // entraria duas vezes no financeiro.
    const jaLancado = await prisma.financialTransaction.findFirst({
      where: { reservationId: reserva.id, category: "RESERVATION_INCOME" },
    });

    if (!jaLancado) {
      await prisma.financialTransaction.create({
        data: {
          reservationId: reserva.id,
          propertyId: reserva.propertyId,
          type: "INCOME",
          category: "RESERVATION_INCOME",
          description: `Reserva ${reserva.code} — cartão`,
          amount: Number(reserva.totalAmount),
          isPaid: true,
          paidAt: new Date(),
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[pagarme] erro no webhook:", e instanceof Error ? e.message : e);
    return NextResponse.json({ received: true });
  }
}
