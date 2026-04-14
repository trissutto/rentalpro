import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function ensureColumns() {
  const cols = ["imageUrl TEXT", "showAsPopup INTEGER DEFAULT 0"];
  for (const col of cols) {
    try {
      await (prisma as any).$executeRawUnsafe(`ALTER TABLE promotions ADD COLUMN ${col}`);
    } catch { /* já existe */ }
  }
}

export async function GET() {
  try {
    await ensureColumns();

    const all = await (prisma as any).$queryRawUnsafe(
      `SELECT * FROM promotions WHERE active = 1 ORDER BY "order" ASC`
    );

    const now = new Date();
    const promotions = (all as any[])
      .filter((p) => {
        const start = p.startDate ? new Date(p.startDate) : null;
        const end = p.endDate ? new Date(p.endDate) : null;
        if (start && start > now) return false;
        if (end && end < now) return false;
        return true;
      })
      .map((p) => ({
        ...p,
        showAsPopup: p.showAsPopup === 1 || p.showAsPopup === true,
        active: p.active === 1 || p.active === true,
      }));

    // Log diagnóstico
    console.log("[Promotions] retornando:", promotions.map(p => ({
      id: p.id, title: p.title, showAsPopup: p.showAsPopup, rawShowAsPopup: (all as any[]).find((a: any) => a.id === p.id)?.showAsPopup
    })));

    return NextResponse.json({ promotions });
  } catch (err) {
    console.error("Promotions API error:", err);
    return NextResponse.json({ promotions: [] });
  }
}
