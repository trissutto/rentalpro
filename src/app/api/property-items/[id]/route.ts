import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { quantity, notes, roomId } = await req.json();
    const propertyItem = await prisma.propertyItem.update({
      where: { id: params.id },
      data: {
        quantity: quantity !== undefined ? Number(quantity) : undefined,
        notes: notes !== undefined ? notes || null : undefined,
        roomId: roomId !== undefined ? roomId || null : undefined,
      },
      include: { item: true, room: { select: { id: true, name: true, type: true } } },
    });
    return NextResponse.json({ propertyItem });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.propertyItem.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
