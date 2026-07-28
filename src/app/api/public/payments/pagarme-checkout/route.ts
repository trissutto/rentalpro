import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cpfValido } from "@/lib/pagbank";
import { lerChavePagarme, criarLinkCartao } from "@/lib/pagarme";

export const maxDuration = 60;

/**
 * POST /api/public/payments/pagarme-checkout
 * body: { code: "RMS4KE0LY", cpf?: "..." }
 *
 * Cria o link de pagamento por CARTÃO (Pagar.me) da reserva e devolve a URL
 * para onde o hóspede deve ser levado. O PagBank atende só o PIX.
 */
export async function POST(req: NextRequest) {
  try {
    const { code, cpf } = (await req.json()) as { code?: string; cpf?: string };
    if (!code) {
      return NextResponse.json({ error: "Codigo da reserva obrigatorio" }, { status: 400 });
    }

    let reserva = await prisma.reservation.findUnique({
      where: { code: String(code).toUpperCase() },
      include: { property: { select: { name: true } } },
    });
    if (!reserva) {
      return NextResponse.json({ error: "Reserva nao encontrada" }, { status: 404 });
    }
    if (reserva.paymentStatus === "PAID") {
      return NextResponse.json({ error: "Esta reserva ja foi paga" }, { status: 409 });
    }

    const apiKey = await lerChavePagarme();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Pagamento por cartao ainda nao configurado" },
        { status: 400 }
      );
    }

    // Mesmo tratamento do PIX: CPF é exigido e fica guardado na reserva
    const informado = (cpf ?? "").replace(/\D/g, "");
    const salvo = (reserva.guestCpf ?? "").replace(/\D/g, "");

    if (!salvo && !informado) {
      return NextResponse.json({ error: "CPF obrigatorio", precisaCpf: true }, { status: 400 });
    }
    if (informado && informado !== salvo) {
      if (!cpfValido(informado)) {
        return NextResponse.json(
          { error: "CPF invalido. Confira os numeros.", precisaCpf: true },
          { status: 400 }
        );
      }
      reserva = await prisma.reservation.update({
        where: { id: reserva.id },
        data: { guestCpf: informado },
        include: { property: { select: { name: true } } },
      });
    }

    const reqUrl = new URL(req.url);
    const origin = process.env.NEXT_PUBLIC_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

    const link = await criarLinkCartao(apiKey, {
      referencia: reserva.code,
      valorReais: Number(reserva.totalAmount),
      nome: reserva.guestName || "Hospede",
      email: reserva.guestEmail || "hospede@reservasita.com.br",
      cpf: (reserva.guestCpf ?? informado).replace(/\D/g, ""),
      telefone: reserva.guestPhone,
      descricao: `Reserva ${reserva.property.name}`,
      urlRetorno: `${origin}/pagar/${reserva.code}?status=success`,
    });

    // Guarda o pedido para o webhook conseguir ligar o pagamento à reserva
    await prisma.reservation.update({
      where: { id: reserva.id },
      data: { mpPaymentId: link.orderId },
    });

    return NextResponse.json({
      paymentUrl: link.paymentUrl,
      orderId: link.orderId,
      expiraEm: link.expiraEm,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[pagarme-checkout]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
