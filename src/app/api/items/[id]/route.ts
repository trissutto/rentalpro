import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, category, description, unit, icon, active } = body;

    const item = await prisma.item.update({
      where: { id: params.id },
      data: {
        name: name?.trim(),
        category,
        description: description?.trim() || null,
        unit,
        icon,
        active,
      },
    });

    return NextResponse.json({ item });
  } catch (err) {
    console.error("Erro ao atualizar item:", err);
    return NextResponse.json({ error: "Erro ao atualizar item" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Soft delete
  await prisma.item.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
