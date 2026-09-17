import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { parseReservationDate, PricingError } from "@/lib/pricing";
import { reservationOccupancyWhere } from "@/lib/reservation-availability";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || !["ADMIN", "TEAM", "OWNER"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const query = new URL(req.url).searchParams;
    const from = parseReservationDate(query.get("from")?.slice(0, 10)), to = parseReservationDate(query.get("to")?.slice(0, 10));
    if (from > to) throw new PricingError("Período inválido", 400);
    to.setUTCHours(23, 59, 59, 999);
    const propertyWhere: Prisma.PropertyWhereInput = { active: true };
    if (query.get("city")) propertyWhere.city = { contains: query.get("city")! };
    if (user.role === "OWNER") propertyWhere.ownerId = user.id;
    const [properties, reservations, cleanings] = await Promise.all([
      prisma.property.findMany({ where: propertyWhere, select: { id: true, name: true, city: true, capacity: true }, orderBy: { name: "asc" } }),
      prisma.reservation.findMany({ where: { property: propertyWhere, AND: [
        reservationOccupancyWhere(), { checkIn: { lte: to } }, { checkOut: { gte: from } },
      ] }, select: { id: true, code: true, propertyId: true, guestName: true, guestCount: true, checkIn: true, checkOut: true,
        nights: true, totalAmount: true, status: true, source: true, notes: true }, orderBy: { checkIn: "asc" } }),
      prisma.cleaning.findMany({ where: { property: propertyWhere, status: { not: "CANCELLED" }, scheduledDate: { gte: from, lte: to } },
        select: { id: true, propertyId: true, scheduledDate: true, status: true, cleanerId: true } }),
    ]);
    return NextResponse.json({ properties, reservations, cleanings }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PricingError ? error.message : "Não foi possível consultar o calendário." }, { status: error instanceof PricingError ? error.status : 500 });
  }
}
