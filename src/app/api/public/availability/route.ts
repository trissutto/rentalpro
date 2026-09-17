import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDateBlocks, reservationOccupancyWhere, ReservationAvailabilityError } from "@/lib/reservation-availability";

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams;
  const propertyId = query.get("propertyId");
  const months = Number(query.get("months") ?? "6");
  if (!propertyId || !Number.isInteger(months) || months < 1 || months > 24) return NextResponse.json({ error: "Informe propertyId e de 1 a 24 meses." }, { status: 400 });
  try {
    const property = await prisma.property.findFirst({ where: { id: propertyId, active: true }, select: { id: true } });
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    const now = new Date();
    const rangeStart = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const today = new Date(rangeStart + "T00:00:00.000Z"), future = new Date(today);
    future.setUTCMonth(future.getUTCMonth() + months);
    future.setUTCHours(23, 59, 59, 999);
    const rangeEnd = future.toISOString().slice(0, 10);
    const [reservations, dateBlocks, allRules] = await Promise.all([
      prisma.reservation.findMany({ where: {
        propertyId, AND: [reservationOccupancyWhere(now), { checkOut: { gte: today } }, { checkIn: { lte: future } }],
      }, select: { checkIn: true, checkOut: true } }),
      getDateBlocks(prisma, propertyId, today, future),
      prisma.pricingRule.findMany({ where: { propertyId, active: true } }),
    ]);
    const occupiedDates = new Set<string>();
    function markRange(start: Date, end: Date) {
      const first = start.toISOString().slice(0, 10), last = end.toISOString().slice(0, 10);
      const cur = new Date((first < rangeStart ? rangeStart : first) + "T12:00:00.000Z");
      const fin = last > rangeEnd ? rangeEnd : last;
      while (cur.toISOString().slice(0, 10) <= fin) {
        occupiedDates.add(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    for (const reservation of reservations) markRange(reservation.checkIn, reservation.checkOut);
    for (const block of dateBlocks) markRange(block.startDate, block.endDate);
    const minNightsRules = allRules.filter(rule => ["PACKAGE", "WEEKEND"].includes(rule.type) && rule.minNights > 1)
      .map(rule => ({ name: rule.name, type: rule.type, daysOfWeek: rule.daysOfWeek ? JSON.parse(rule.daysOfWeek) : null,
        startDate: rule.startDate?.toISOString().slice(0, 10) ?? null, endDate: rule.endDate?.toISOString().slice(0, 10) ?? null, minNights: rule.minNights }));
    const coefficient = (type: string) => allRules.find(rule => rule.type === type && rule.priceType === "MULTIPLIER")?.value ?? 1;
    return NextResponse.json({ occupiedDates: Array.from(occupiedDates).sort(), minNightsRules, rangeStart, rangeEnd,
      pricingCoeffs: { holiday: coefficient("HOLIDAY_BASE"), weekend: coefficient("WEEKEND"), weekday: coefficient("WEEKDAY") } },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ReservationAvailabilityError ? error.message : "Não foi possível consultar a disponibilidade." }, { status: 503 });
  }
}
