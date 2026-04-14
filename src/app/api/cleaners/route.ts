import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Fetch dedicated cleaner profiles
  const cleaners = await prisma.cleaner.findMany({
    where: { active: true },
    include: {
      _count: {
        select: {
          cleanings: { where: { status: { in: ["PENDING", "IN_PROGRESS"] } } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  // Also fetch team members from users table (role = TEAM)
  // who don't already have a cleaner profile linked
  const cleanerUserIds = cleaners
    .map((c) => c.userId)
    .filter((id): id is string => id !== null && id !== undefined);

  const teamMembers = await prisma.user.findMany({
    where: {
      active: true,
      role: "TEAM",
      id: { notIn: cleanerUserIds },
    },
    select: { id: true, name: true, phone: true, specialty: true },
    orderBy: { name: "asc" },
  });

  // Normalize team members into the same shape as cleaners
  const teamAsCleaner = teamMembers.map((u) => ({
    id: `user_${u.id}`, // prefix to distinguish from cleaner records
    userId: u.id,
    name: u.name,
    phone: u.phone ?? "",
    email: null,
    region: u.specialty ?? "Equipe",
    active: true,
    _count: { cleanings: 0 },
    _fromUser: true,
  }));

  const all = [
    ...cleaners.map((c) => ({ ...c, _fromUser: false })),
    ...teamAsCleaner,
  ].sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ cleaners: all });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, phone, email, region } = body;

    if (!name || !phone) {
      return NextResponse.json({ error: "Nome e telefone são obrigatórios" }, { status: 400 });
    }

    const cleaner = await prisma.cleaner.create({
      data: { name, phone, email, region },
    });

    return NextResponse.json({ cleaner }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao criar faxineira" }, { status: 500 });
  }
}
