import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET: list items assigned to a property (optionally filtered by room)
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const roomId     = searchParams.get("roomId");

  if (!propertyId) return NextResponse.json({ error: "propertyId obrigatório" }, { status: 400 });

  const where: Record<string, unknown> = { propertyId };
  if (roomId) where.roomId = roomId;

  const propertyItems = await prisma.propertyItem.findMany({
    where,
    include: {
      item: true,
      room: { select: { id: true, name: true, type: true } },
    },
    orderBy: [{ room: { order: "asc" } }, { item: { name: "asc" } }],
  });

  return NextResponse.json({ propertyItems });
}

// POST: assign an item to a property room
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { propertyId, itemId, roomId, quantity, notes } = await req.json();

    if (!propertyId || !itemId) {
      return NextResponse.json({ error: "propertyId e itemId são obrigatórios" }, { status: 400 });
    }

    // Upsert: if already exists, update quantity
    const existing = await prisma.propertyItem.findFirst({
      where: { propertyId, itemId, roomId: roomId || null },
    });

    let propertyItem;
    if (existing) {
      propertyItem = await prisma.propertyItem.update({
        where: { id: existing.id },
        data: { quantity: Number(quantity) || 1, notes: notes || null },
        include: { item: true, room: { select: { id: true, name: true, type: true } } },
      });
    } else {
      propertyItem = await prisma.propertyItem.create({
        data: {
          propertyId,
          itemId,
          roomId: roomId || null,
          quantity: Number(quantity) || 1,
          notes: notes || null,
        },
        include: { item: true, room: { select: { id: true, name: true, type: true } } },
      });
    }

    return NextResponse.json({ propertyItem }, { status: 201 });
  } catch (err) {
    console.error("Erro ao vincular item:", err);
    return NextResponse.json({ error: "Erro ao vincular item" }, { status: 500 });
  }
}
