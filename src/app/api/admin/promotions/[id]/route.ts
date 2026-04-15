import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// Garante que as colunas extras existem
async function ensureColumns() {
  const cols = ["imageUrl TEXT", "showAsPopup INTEGER DEFAULT 0"];
  for (const col of cols) {
    try {
      await (prisma as any).$executeRawUnsafe(`ALTER TABLE promotions ADD COLUMN ${col}`);
    } catch { /* coluna já existe */ }
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await ensureColumns();

  const body = await req.json();
  const {
    title, subtitle, description, emoji, bgGradient, textColor,
    ctaText, ctaUrl, imageUrl, showAsPopup, startDate, endDate,
    active, order,
  } = body;

  // Monta update dinâmico via raw SQL (funciona independente do Prisma client model)
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (title       !== undefined) { sets.push("title = ?");       vals.push(title); }
  if (subtitle    !== undefined) { sets.push("subtitle = ?");    vals.push(subtitle || null); }
  if (description !== undefined) { sets.push("description = ?"); vals.push(description || null); }
  if (emoji       !== undefined) { sets.push("emoji = ?");       vals.push(emoji); }
  if (bgGradient  !== undefined) { sets.push("bgGradient = ?");  vals.push(bgGradient); }
  if (textColor   !== undefined) { sets.push("textColor = ?");   vals.push(textColor); }
  if (ctaText     !== undefined) { sets.push("ctaText = ?");     vals.push(ctaText); }
  if (ctaUrl      !== undefined) { sets.push("ctaUrl = ?");      vals.push(ctaUrl); }
  if (imageUrl    !== undefined) { sets.push("imageUrl = ?");    vals.push(imageUrl || null); }
  if (showAsPopup !== undefined) { sets.push("showAsPopup = ?"); vals.push(showAsPopup ? 1 : 0); }
  if (startDate   !== undefined) { sets.push("startDate = ?");   vals.push(startDate ? new Date(startDate).toISOString() : null); }
  if (endDate     !== undefined) { sets.push("endDate = ?");     vals.push(endDate ? new Date(endDate).toISOString() : null); }
  if (active      !== undefined) { sets.push("active = ?");      vals.push(active ? 1 : 0); }
  if (order       !== undefined) { sets.push('"order" = ?');     vals.push(Number(order)); }

  sets.push("updatedAt = datetime('now')");

  if (sets.length > 1) {
    vals.push(params.id);
    await (prisma as any).$executeRawUnsafe(
      `UPDATE promotions SET ${sets.join(", ")} WHERE id = ?`,
      ...vals
    );
  }

  const rows = await (prisma as any).$queryRawUnsafe(`SELECT * FROM promotions WHERE id = ?`, params.id);
  const row = rows[0] ?? null;
  if (row) {
    row.showAsPopup = row.showAsPopup === 1 || row.showAsPopup === true;
    row.active = row.active === 1 || row.active === true;
  }
  return NextResponse.json({ promotion: row });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await (prisma as any).$executeRawUnsafe(`DELETE FROM promotions WHERE id = ?`, params.id);
  return NextResponse.json({ ok: true });
}
