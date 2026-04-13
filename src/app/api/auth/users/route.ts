import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, hashPassword } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");

  const users = await prisma.user.findMany({
    where: { active: true, ...(role ? { role } : {}) },
    select: { id: true, name: true, email: true, role: true, phone: true, specialty: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const { name, email, password, role, phone, specialty } = await req.json();
    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const hashed = await hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashed,
        role,
        phone,
        specialty: role === "TEAM" ? specialty || "Outros" : null,
      },
      select: { id: true, name: true, email: true, role: true, specialty: true },
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao criar usuário (e-mail já cadastrado?)" }, { status: 500 });
  }
}
