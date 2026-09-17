import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateReservationQuote, parseReservationStay, PricingError } from "@/lib/pricing";

export async function GET(req: NextRequest) {
  try {
    const query = new URL(req.url).searchParams;
    const propertyId = query.get("propertyId");
    if (!propertyId) return NextResponse.json({ error: "propertyId obrigatório" }, { status: 400 });
    const stay = parseReservationStay(query.get("checkIn"), query.get("checkOut"), false);
    const property = await prisma.property.findFirst({ where: { id: propertyId, active: true }, include: { pricingRules: { where: { active: true } } } });
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    const quote = calculateReservationQuote(property, stay.checkIn, stay.checkOut, query.get("guestCount") ?? "1");
    return NextResponse.json({ ...quote, quote }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PricingError ? error.message : "Não foi possível calcular a cotação." }, { status: error instanceof PricingError ? error.status : 500 });
  }
}
