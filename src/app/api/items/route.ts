import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { active: true };
  if (category) where.category = category;
  if (search) where.name = { contains: search };

  const items = await prisma.item.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { name, category, description, unit, icon } = body;

    if (!name || !category) {
      return NextResponse.json({ error: "Nome e categoria são obrigatórios" }, { status: 400 });
    }

    const item = await prisma.item.create({
      data: {
        name: name.trim(),
        category,
        description: description?.trim() || null,
        unit: unit || "un",
        icon: icon || "📦",
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    console.error("Erro ao criar item:", err);
    return NextResponse.json({ error: "Erro ao criar item" }, { status: 500 });
  }
}
