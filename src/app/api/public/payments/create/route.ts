import { beginPaymentAttempt, savePaymentAttempt, reconcilePayment, PaymentError } from "@/lib/payment-integrity";
import { authorizeGuestRequest, createGuestLink } from "@/lib/guest-access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
  const body = await req.json().catch(() => ({}));
  const { code } = body;
  if (!code) return NextResponse.json({ error: "Código da reserva obrigatório" }, { status: 400 });

    const denied = await authorizeGuestRequest(req, String(code), "payments:write");
    if (denied) return denied;
  const reservation = await prisma.reservation.findUnique({
    where: { code: String(code).toUpperCase() },
    include: { property: { select: { name: true } } },
  });
  if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });

  let tokenSetting = null;
  try {
    tokenSetting = await prisma.setting.findUnique({ where: { key: "mp_access_token" } });
  } catch {
    return NextResponse.json({ error: "Banco de dados não atualizado. Execute npx prisma db push." }, { status: 500 });
  }
  if (!tokenSetting?.value) {
    return NextResponse.json({ error: "Pagamento online não configurado. Entre em contato com a administração." }, { status: 400 });
  }

  const accessToken = tokenSetting.value.trim();
  const attempt = await beginPaymentAttempt(reservation.id, "mercadopago", "checkout");
  // If a valid checkout URL already exists, return it (avoid duplicate preferences)
  // But only reuse if it looks like a real MP URL (not a failed/incomplete attempt)
  if (
    reservation.mpCheckoutUrl &&
    reservation.paymentStatus === "PENDING" &&
    reservation.mpCheckoutUrl.includes("mercadopago.com")
  ) {
    return NextResponse.json({ checkoutUrl: reservation.mpCheckoutUrl });
  }



  // Use the actual request URL origin (works in both localhost and production)
  const reqUrl = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;

  const isLocalhost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";

  const preference: Record<string, unknown> = {
    items: [
      {
        id: reservation.code,
        title: `Reserva ${reservation.property.name} — ${reservation.code}`,
        description: `Check-in: ${new Date(reservation.checkIn).toLocaleDateString("pt-BR")} · Check-out: ${new Date(reservation.checkOut).toLocaleDateString("pt-BR")} · ${reservation.nights} diárias cobradas`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: attempt.amountCents / 100,
      },
    ],
    payer: {
      name: reservation.guestName,
      email: reservation.guestEmail || undefined,
    },
    payment_methods: { installments: 12 },
    back_urls: {
      success: createGuestLink(reservation, `/pagar/${reservation.code}?status=success`, origin),
      failure: createGuestLink(reservation, `/pagar/${reservation.code}?status=failure`, origin),
      pending: createGuestLink(reservation, `/pagar/${reservation.code}?status=pending`, origin),
    },
    // auto_return requires HTTPS — only enable in production
    ...(isLocalhost ? {} : { auto_return: "approved" }),
    // notification_url requires public HTTPS — skip on localhost
    ...(isLocalhost ? {} : { notification_url: `${origin}/api/webhooks/mercadopago` }),
    external_reference: reservation.code,
  };

  try {
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": attempt.key,
      },
      body: JSON.stringify(preference),
    });
    const mpData = await mpRes.json();
    if (!mpRes.ok) {
      return NextResponse.json({ error: mpData.message || "Erro ao gerar pagamento" }, { status: 400 });
    }

    await savePaymentAttempt(reservation.id, attempt, String(mpData.id));
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { mpPreferenceId: mpData.id, mpCheckoutUrl: mpData.init_point },
    });

    return NextResponse.json({ checkoutUrl: mpData.init_point });
  } catch {
    return NextResponse.json({ error: "Erro ao conectar com Mercado Pago" }, { status: 500 });
  }

  } catch (err) {
    if (err instanceof PaymentError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Erro inesperado pagamento público:", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
