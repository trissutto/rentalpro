import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

async function ensureColumns() {
  const cols = ["imageUrl TEXT", "showAsPopup INTEGER DEFAULT 0"];
  for (const col of cols) {
    try {
      await (prisma as any).$executeRawUnsafe(`ALTER TABLE promotions ADD COLUMN ${col}`);
    } catch { /* já existe */ }
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  await ensureColumns();

  const promotions = await (prisma as any).$queryRawUnsafe(
    `SELECT * FROM promotions ORDER BY "order" ASC`
  );
  // Normaliza showAsPopup de 0/1 para boolean
  const normalized = (promotions as any[]).map((p) => ({
    ...p,
    showAsPopup: p.showAsPopup === 1 || p.showAsPopup === true,
  }));
  return NextResponse.json({ promotions: normalized });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await ensureColumns();

  const body = await req.json();
  const { title, subtitle, description, emoji, bgGradient, textColor, ctaText, ctaUrl, imageUrl, showAsPopup, startDate, endDate, active, order } = body;

  if (!title) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });

  const id = `promo_${Date.now()}`;

  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO promotions (id, title, subtitle, description, emoji, bgGradient, textColor, ctaText, ctaUrl, imageUrl, showAsPopup, startDate, endDate, active, "order", createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    id,
    title,
    subtitle || null,
    description || null,
    emoji || "🎉",
    bgGradient || "from-teal-500 to-cyan-600",
    textColor || "white",
    ctaText || "Ver imóveis",
    ctaUrl || "/imoveis",
    imageUrl || null,
    showAsPopup ? 1 : 0,
    startDate ? new Date(startDate).toISOString() : null,
    endDate ? new Date(endDate).toISOString() : null,
    active !== false ? 1 : 0,
    Number(order) || 0,
  );

  const rows = await (prisma as any).$queryRawUnsafe(`SELECT * FROM promotions WHERE id = ?`, id);
  return NextResponse.json({ promotion: rows[0] ?? null });
}
