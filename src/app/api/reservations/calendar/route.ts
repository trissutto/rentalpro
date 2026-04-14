import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const city = searchParams.get("city");

  if (!from || !to) {
    return NextResponse.json({ error: "from e to são obrigatórios" }, { status: 400 });
  }

  const propertyWhere: Record<string, unknown> = { active: true };
  if (city) propertyWhere.city = { contains: city, mode: "insensitive" };
  if (user.role === "OWNER") propertyWhere.ownerId = user.id;

  const properties = await prisma.property.findMany({
    where: propertyWhere,
    select: { id: true, name: true, city: true, capacity: true },
    orderBy: { name: "asc" },
  });

  const reservations = await prisma.reservation.findMany({
    where: {
      property: propertyWhere,
      status: { notIn: ["CANCELLED"] },
      OR: [
        { checkIn: { gte: new Date(from), lte: new Date(to) } },
        { checkOut: { gte: new Date(from), lte: new Date(to) } },
        { checkIn: { lte: new Date(from) }, checkOut: { gte: new Date(to) } },
      ],
    },
    select: {
      id: true,
      code: true,
      propertyId: true,
      guestName: true,
      guestCount: true,
      checkIn: true,
      checkOut: true,
      nights: true,
      totalAmount: true,
      status: true,
      source: true,
      notes: true,
    },
    orderBy: { checkIn: "asc" },
  });

  const cleanings = await prisma.cleaning.findMany({
    where: {
      property: propertyWhere,
      scheduledDate: { gte: new Date(from), lte: new Date(to) },
    },
    select: {
      id: true,
      propertyId: true,
      scheduledDate: true,
      status: true,
      cleanerId: true,
    },
  });

  return NextResponse.json({ properties, reservations, cleanings });
}
