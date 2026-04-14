import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");
  const checkIn = searchParams.get("checkIn");
  const checkOut = searchParams.get("checkOut");
  const minGuests = searchParams.get("minGuests") ? Number(searchParams.get("minGuests")) : null;
  const maxGuests = searchParams.get("maxGuests") ? Number(searchParams.get("maxGuests")) : null;

  const where: Record<string, unknown> = { active: true };
  if (city) where.city = { contains: city, mode: "insensitive" };
  if (minGuests || maxGuests) {
    where.capacity = {
      ...(minGuests ? { gte: minGuests } : {}),
      ...(maxGuests ? { lte: maxGuests } : {}),
    };
  }

  let properties = await prisma.property.findMany({
    where,
    include: {
      owner: { select: { name: true } },
      _count: { select: { reservations: true } },
    },
    orderBy: { name: "asc" },
  });

  // Filtrar por disponibilidade se datas informadas
  if (checkIn && checkOut) {
    const ci = new Date(checkIn);
    const co = new Date(checkOut);
    const conflicts = await prisma.reservation.findMany({
      where: {
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
        OR: [{ checkIn: { lt: co }, checkOut: { gt: ci } }],
      },
      select: { propertyId: true },
    });
    const busyIds = new Set(conflicts.map((r) => r.propertyId));
    properties = properties.filter((p) => !busyIds.has(p.id));
  }

  return NextResponse.json({ properties });
}
