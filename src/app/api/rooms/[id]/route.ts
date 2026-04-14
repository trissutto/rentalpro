import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { name, type, floor, notes, order } = await req.json();
    const room = await prisma.room.update({
      where: { id: params.id },
      data: {
        name: name?.trim(),
        type,
        floor: floor !== undefined ? Number(floor) : undefined,
        notes: notes?.trim() || null,
        order: order !== undefined ? Number(order) : undefined,
      },
      include: {
        property: { select: { id: true, name: true } },
        _count: { select: { propertyItems: true } },
      },
    });
    return NextResponse.json({ room });
  } catch (err) {
    console.error("Erro ao atualizar cômodo:", err);
    return NextResponse.json({ error: "Erro ao atualizar cômodo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.room.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
