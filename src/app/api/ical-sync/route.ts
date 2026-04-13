import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// ── iCal parser (sem dependências externas) ───────────────────────────────
export interface ICalEvent {
  summary: string;
  dtstart: string;  // YYYY-MM-DD
  dtend:   string;  // YYYY-MM-DD
  uid:     string;
}

export function parseIcalDate(raw: string): string {
  const digits = raw.replace(/[TZ]/g, "").slice(0, 8);
  return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`;
}

export function parseIcal(text: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")   // RFC 5545 line unfolding
    .split("\n");

  let current: Partial<ICalEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current?.dtstart && current?.dtend && current?.uid) {
        events.push(current as ICalEvent);
      }
      current = null;
    } else if (current) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key   = line.slice(0, colonIdx).split(";")[0].toUpperCase();
      const value = line.slice(colonIdx + 1).trim();

      if      (key === "DTSTART")  current.dtstart = parseIcalDate(value);
      else if (key === "DTEND")    current.dtend   = parseIcalDate(value);
      else if (key === "SUMMARY")  current.summary = value;
      else if (key === "UID")      current.uid     = value;
    }
  }

  return events;
}

// ── Core sync logic (reused by cron) ─────────────────────────────────────
export async function syncIcalUrl(
  propertyId: string,
  url: string,
  label: string,
  source?: string,
): Promise<{ created: number; deleted: number; source: string }> {

  // 1. Fetch iCal
  const res = await fetch(url, {
    headers: { "User-Agent": "RentalPro-Sync/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  const icsText = await res.text();

  // 2. Parse
  const events    = parseIcal(icsText);
  const sourceKey = (source ?? label ?? new URL(url).hostname).toLowerCase().slice(0, 40);
  const today     = new Date().toISOString().slice(0, 10);
  const future    = events.filter(e => e.dtend >= today);

  // 3. Delete old ICAL blocks from this source (raw SQL)
  const delResult = await (prisma as any).$executeRawUnsafe(
    `DELETE FROM date_blocks WHERE propertyId = ? AND type = 'ICAL' AND source = ?`,
    propertyId, sourceKey,
  );

  // 4. Insert new blocks
  let created = 0;
  for (const ev of future) {
    if (ev.dtstart >= ev.dtend) continue;
    const id  = `ical_${sourceKey.slice(0,8)}_${ev.uid.slice(0,16)}_${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    await (prisma as any).$executeRawUnsafe(
      `INSERT OR IGNORE INTO date_blocks
         (id, propertyId, startDate, endDate, reason, type, source, createdAt)
       VALUES (?, ?, ?, ?, ?, 'ICAL', ?, ?)`,
      id,
      propertyId,
      new Date(ev.dtstart + "T12:00:00Z").toISOString(),
      new Date(ev.dtend   + "T12:00:00Z").toISOString(),
      ev.summary || label || sourceKey,
      sourceKey,
      now,
    );
    created++;
  }

  // 5. Persist URL in property.icalUrls
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT icalUrls FROM properties WHERE id = ?`, propertyId,
  );
  if (rows.length > 0) {
    let urls: { url: string; label: string; source: string }[] = [];
    try { urls = JSON.parse(rows[0].icalUrls ?? "[]"); } catch { urls = []; }
    const idx   = urls.findIndex(u => u.source === sourceKey);
    const entry = { url, label: label ?? sourceKey, source: sourceKey };
    if (idx >= 0) urls[idx] = entry; else urls.push(entry);
    await (prisma as any).$executeRawUnsafe(
      `UPDATE properties SET icalUrls = ? WHERE id = ?`,
      JSON.stringify(urls), propertyId,
    );
  }

  return { created, deleted: delResult ?? 0, source: sourceKey };
}

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
