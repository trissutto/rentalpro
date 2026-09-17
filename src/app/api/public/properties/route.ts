import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_PROPERTY_SELECT } from "@/lib/public-property";
import { getDateBlocks, reservationOccupancyWhere } from "@/lib/reservation-availability";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city")?.trim();
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");
  const minGuests = searchParams.has("minGuests") ? Number(searchParams.get("minGuests")) : undefined;
  const maxGuests = searchParams.has("maxGuests") ? Number(searchParams.get("maxGuests")) : undefined;
  if ([minGuests, maxGuests].some((n) => n !== undefined && (!Number.isInteger(n) || n < 1 || n > 1000))
    || (minGuests !== undefined && maxGuests !== undefined && minGuests > maxGuests)) {
    return NextResponse.json({ error: "Quantidade de hóspedes inválida" }, { status: 400 });
  }
  let ci: Date | undefined;
  let co: Date | undefined;
  if (checkIn || checkOut) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn || "") || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut || "")) {
      return NextResponse.json({ error: "Informe as duas datas no formato válido" }, { status: 400 });
    }
    ci = new Date(`${checkIn}T00:00:00Z`);
    co = new Date(`${checkOut}T23:59:59.999Z`);
    if (!Number.isFinite(ci.getTime()) || !Number.isFinite(co.getTime()) || co <= ci
      || ci.toISOString().slice(0, 10) !== checkIn || co.toISOString().slice(0, 10) !== checkOut) {
      return NextResponse.json({ error: "Período inválido" }, { status: 400 });
    }
  }
  let properties = await prisma.property.findMany({
    where: {
      active: true,
      ...(city ? { city: { contains: city } } : {}),
      ...(minGuests !== undefined || maxGuests !== undefined ? { maxGuests: { gte: minGuests, lte: maxGuests } } : {}),
    },
    select: PUBLIC_PROPERTY_SELECT, orderBy: { name: "asc" },
  });
  if (ci && co) {
    const conflicts = await prisma.reservation.findMany({
      where: { AND: [reservationOccupancyWhere(), { checkIn: { lte: co } }, { checkOut: { gte: ci } }] },
      select: { propertyId: true },
    });
    const busyIds = new Set(conflicts.map((r) => r.propertyId));
    const checked = await Promise.all(properties.map(async (property) => ({
      property,
      blocked: busyIds.has(property.id) || (await getDateBlocks(prisma, property.id, ci!, co!)).length > 0,
    })));
    properties = checked.filter((p) => !p.blocked).map((p) => p.property);
  }
  return NextResponse.json({ properties }, { headers: { "Cache-Control": "no-store" } });
}
