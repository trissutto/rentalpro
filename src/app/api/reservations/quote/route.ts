import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { calculateReservationQuote, parseReservationStay, PricingError } from "@/lib/pricing";

/** Staff quotations also support historical bookings and explicitly entered totals. */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || !["ADMIN", "TEAM"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const query = new URL(req.url).searchParams;
    const propertyId = query.get("propertyId");
    if (!propertyId) throw new PricingError("propertyId obrigatório", 400);
    const stay = parseReservationStay(query.get("checkIn"), query.get("checkOut"));
    const property = await prisma.property.findFirst({ where: { id: propertyId, active: true }, include: { pricingRules: { where: { active: true } } } });
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    const quote = calculateReservationQuote(property, stay.checkIn, stay.checkOut, query.get("guestCount") ?? "1", query.get("manualTotal") ?? undefined);
    return NextResponse.json({ quote }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PricingError ? error.message : "Não foi possível calcular a cotação." }, { status: error instanceof PricingError ? error.status : 500 });
  }
}
