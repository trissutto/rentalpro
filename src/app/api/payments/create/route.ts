import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { reservationId } = body;
  if (!reservationId) return NextResponse.json({ error: "reservationId obrigatório" }, { status: 400 });

  // Get reservation
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { property: { select: { name: true } } },
  });
  if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });

  // Get MP access token from settings
  let tokenSetting = null;
  try {
    tokenSetting = await prisma.setting.findUnique({ where: { key: "mp_access_token" } });
  } catch {
    return NextResponse.json({ error: "Configure o banco de dados primeiro: npx prisma db push" }, { status: 500 });
  }
  if (!tokenSetting?.value) {
    return NextResponse.json({ error: "Access Token do Mercado Pago não configurado. Acesse Configurações → Mercado Pago." }, { status: 400 });
  }

  const accessToken = tokenSetting.value.trim();
  const reqUrl = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_BASE_URL || `${reqUrl.protocol}//${reqUrl.host}`;
  const isLocalhost = reqUrl.hostname === "localhost" || reqUrl.hostname === "127.0.0.1";

  // Build preference — skip localhost-incompatible fields in dev
  const preference: Record<string, unknown> = {
    items: [
      {
        id: reservation.code,
        title: `Reserva ${reservation.property.name} — ${reservation.code}`,
        description: `Check-in: ${new Date(reservation.checkIn).toLocaleDateString("pt-BR")} · Check-out: ${new Date(reservation.checkOut).toLocaleDateString("pt-BR")} · ${reservation.nights} noite(s)`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(reservation.totalAmount),
      },
    ],
    payer: {
      name: reservation.guestName,
      email: reservation.guestEmail || undefined,
      phone: reservation.guestPhone
        ? { area_code: reservation.guestPhone.replace(/\D/g, "").slice(0, 2), number: reservation.guestPhone.replace(/\D/g, "").slice(2) }
        : undefined,
    },
    payment_methods: {
      installments: 12,
      excluded_payment_types: [],
    },
    back_urls: {
      success: `${origin}/pagar/${reservation.code}?status=success`,
      failure: `${origin}/pagar/${reservation.code}?status=failure`,
      pending: `${origin}/pagar/${reservation.code}?status=pending`,
    },
    // auto_return and notification_url require public HTTPS — skip on localhost
    ...(isLocalhost ? {} : { auto_return: "approved" }),
    ...(isLocalhost ? {} : { notification_url: `${origin}/api/webhooks/mercadopago` }),
    external_reference: reservation.code,
    expires: false,
    metadata: {
      reservation_id: reservation.id,
      reservation_code: reservation.code,
    },
  };

  try {
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preference),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error("MP error:", mpData);
      return NextResponse.json({ error: mpData.message || "Erro ao criar preferência de pagamento" }, { status: 400 });
    }

    // Save preference ID and checkout URL to reservation
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        mpPreferenceId: mpData.id,
        mpCheckoutUrl: mpData.init_point, // production URL
      },
    });

    return NextResponse.json({
      preferenceId: mpData.id,
      checkoutUrl: mpData.init_point,
      sandboxUrl: mpData.sandbox_init_point,
    });
  } catch (err) {
    console.error("Erro ao criar preferência MP:", err);
    return NextResponse.json({ error: "Erro ao conectar com Mercado Pago" }, { status: 500 });
  }

  } catch (err) {
    console.error("Erro inesperado:", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
