import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const { name, phone, role, specialty, password } = await req.json();

    const data: Record<string, unknown> = {
      name,
      phone,
      role,
      specialty: role === "TEAM" ? specialty || "Outros" : null,
    };

    if (password && password.length >= 6) {
      data.password = await hashPassword(password);
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data,
      select: { id: true, name: true, email: true, role: true, phone: true, specialty: true },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // Não pode desativar a si mesmo
  if (user.id === params.id) {
    return NextResponse.json({ error: "Não é possível desativar sua própria conta" }, { status: 400 });
  }

  await prisma.user.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
