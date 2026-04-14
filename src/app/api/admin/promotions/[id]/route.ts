import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Garante que as colunas extras existem (SQLite não tem IF NOT EXISTS para colunas)
async function ensureColumns() {
  const cols = ["imageUrl TEXT", "showAsPopup INTEGER DEFAULT 0"];
  for (const col of cols) {
    try {
      await (prisma as any).$executeRawUnsafe(
        `ALTER TABLE promotions ADD COLUMN ${col}`
      );
    } catch { /* coluna já existe, ignorar */ }
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await ensureColumns();

  const body = await req.json();
  const { title, subtitle, description, emoji, bgGradient, textColor, ctaText, ctaUrl, imageUrl, showAsPopup, startDate, endDate, active, order } = body;

  // Atualiza campos originais via Prisma
  await (prisma as any).promotion.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(subtitle !== undefined && { subtitle }),
      ...(description !== undefined && { description }),
      ...(emoji !== undefined && { emoji }),
      ...(bgGradient !== undefined && { bgGradient }),
      ...(textColor !== undefined && { textColor }),
      ...(ctaText !== undefined && { ctaText }),
      ...(ctaUrl !== undefined && { ctaUrl }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(active !== undefined && { active }),
      ...(order !== undefined && { order: Number(order) }),
      updatedAt: new Date(),
    },
  });

  // Atualiza campos novos via SQL direto (evita problema de cache do Prisma client)
  if (imageUrl !== undefined || showAsPopup !== undefined) {
    const sets: string[] = [];
    const vals: any[] = [];
    if (imageUrl !== undefined) { sets.push("imageUrl = ?"); vals.push(imageUrl || null); }
    if (showAsPopup !== undefined) { sets.push("showAsPopup = ?"); vals.push(showAsPopup ? 1 : 0); }
    if (sets.length > 0) {
      vals.push(params.id);
      await (prisma as any).$executeRawUnsafe(
        `UPDATE promotions SET ${sets.join(", ")} WHERE id = ?`,
        ...vals
      );
    }
  }

  // Retorna registro atualizado
  const rows = await (prisma as any).$queryRawUnsafe(
    `SELECT * FROM promotions WHERE id = ?`, params.id
  );
  return NextResponse.json({ promotion: rows[0] ?? null });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await (prisma as any).promotion.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
