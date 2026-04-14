import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncIcalUrl } from "@/lib/ical";

const CRON_SECRET = process.env.CRON_SECRET ?? "rentalpro-cron-2026";

/**
 * GET /api/cron/ical-sync?secret=XXX
 *
 * Re-syncs all iCal URLs stored in every property.
 * Run daily via cron, Windows Task Scheduler, or any HTTP scheduler.
 *
 * Example curl:
 *   curl "http://localhost:3000/api/cron/ical-sync?secret=rentalpro-cron-2026"
 */
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results: {
    propertyId: string;
    propertyName: string;
    source: string;
    created: number;
    error?: string;
  }[] = [];

  // 1. Load all properties with their icalUrls
  let properties: { id: string; name: string; icalUrls: string }[] = [];
  try {
    properties = await (prisma as any).$queryRawUnsafe(
      `SELECT id, name, icalUrls FROM properties WHERE icalUrls != '[]' AND icalUrls IS NOT NULL`
    );
  } catch {
    return NextResponse.json({ error: "Erro ao carregar imóveis" }, { status: 500 });
  }

  // 2. Sync each URL
  for (const prop of properties) {
    let urls: { url: string; label: string; source: string }[] = [];
    try { urls = JSON.parse(prop.icalUrls ?? "[]"); } catch { continue; }

    for (const entry of urls) {
      try {
        const res = await syncIcalUrl(prop.id, entry.url, entry.label, entry.source);
        results.push({
          propertyId:   prop.id,
          propertyName: prop.name,
          source:       entry.source,
          created:      res.created,
        });
      } catch (e: unknown) {
        results.push({
          propertyId:   prop.id,
          propertyName: prop.name,
          source:       entry.source,
          created:      0,
          error:        e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const elapsed = Date.now() - startedAt;
  const totalCreated = results.reduce((s, r) => s + r.created, 0);
  const errors       = results.filter(r => r.error);

  console.log(`[iCal cron] ${results.length} fontes sincronizadas, ${totalCreated} bloqueios criados, ${errors.length} erros — ${elapsed}ms`);

  return NextResponse.json({
    ok:           true,
    synced:       results.length,
    totalCreated,
    errors:       errors.length,
    elapsedMs:    elapsed,
    results,
    timestamp:    new Date().toISOString(),
  });
}
