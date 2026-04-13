import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");

  const where: Record<string, unknown> = { active: true };
  if (propertyId) where.propertyId = propertyId;

  // Owners only see their properties
  if (user.role === "OWNER") {
    where.property = { ownerId: user.id };
  }

  const rooms = await prisma.room.findMany({
    where,
    include: {
      property: { select: { id: true, name: true } },
      _count: { select: { propertyItems: true } },
    },
    orderBy: [{ floor: "asc" }, { order: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ rooms });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { propertyId, name, type, floor, notes } = body;

    if (!propertyId || !name || !type) {
      return NextResponse.json({ error: "Imóvel, nome e tipo são obrigatórios" }, { status: 400 });
    }

    // Get max order for this property
    const maxOrder = await prisma.room.aggregate({
      where: { propertyId },
      _max: { order: true },
    });

    const room = await prisma.room.create({
      data: {
        propertyId,
        name: name.trim(),
        type,
        floor: Number(floor) || 1,
        order: (maxOrder._max.order ?? -1) + 1,
        notes: notes?.trim() || null,
      },
      include: {
        property: { select: { id: true, name: true } },
        _count: { select: { propertyItems: true } },
      },
    });

    return NextResponse.json({ room }, { status: 201 });
  } catch (err) {
    console.error("Erro ao criar cômodo:", err);
    return NextResponse.json({ error: "Erro ao criar cômodo" }, { status: 500 });
  }
}
