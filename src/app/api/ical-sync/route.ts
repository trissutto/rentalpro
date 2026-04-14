import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { syncIcalUrl } from "@/lib/ical";

// ── POST /api/ical-sync — manual import ───────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { propertyId, url, label, source } = body;

  if (!propertyId || !url) {
    return NextResponse.json({ error: "propertyId e url são obrigatórios" }, { status: 400 });
  }

  try {
    const result = await syncIcalUrl(propertyId, url, label ?? "ical", source);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// ── GET /api/ical-sync?propertyId=X — list stored URLs ────────────────────
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  if (!propertyId) return NextResponse.json({ error: "propertyId obrigatório" }, { status: 400 });

  try {
    const rows: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT icalUrls FROM properties WHERE id = ?`, propertyId,
    );
    let icalUrls: unknown[] = [];
    try { icalUrls = JSON.parse(rows[0]?.icalUrls ?? "[]"); } catch { icalUrls = []; }
    return NextResponse.json({ icalUrls });
  } catch {
    return NextResponse.json({ icalUrls: [] });
  }
}
