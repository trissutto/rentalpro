import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ICalSyncError, readIcalSources, syncIcalUrl } from "@/lib/ical";
import { checkCronSecret } from "@/lib/cron-auth";

/**
 * GET /api/cron/ical-sync?secret=XXX
 *
 * Re-syncs all iCal URLs stored in every property.
 * Run daily via cron, Windows Task Scheduler, or any HTTP scheduler.
 *
 * Example curl:
 *   curl "http://localhost:3000/api/cron/ical-sync?secret=<CRON_SECRET>"
 */
export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const denied = checkCronSecret(req.headers.get("x-cron-secret") ?? bearer ?? new URL(req.url).searchParams.get("secret"));
  if (denied) return denied;

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
    let urls;
    try {
      urls = readIcalSources(prop.icalUrls);
    } catch {
      results.push({ propertyId: prop.id, propertyName: prop.name, source: "configuração", created: 0, error: "Configuração iCal inválida. Os bloqueios foram preservados." });
      continue;
    }

    for (const entry of urls) {
      try {
        const res = await syncIcalUrl(prop.id, entry.url, entry.label, entry.source);
        results.push({
          propertyId:   prop.id,
          propertyName: prop.name,
          source:       res.source,
          created:      res.created,
        });
      } catch (e: unknown) {
        results.push({
          propertyId:   prop.id,
          propertyName: prop.name,
          source:       entry.source,
          created:      0,
          error:        e instanceof ICalSyncError ? e.message : "Falha ao sincronizar. Os bloqueios anteriores foram preservados.",
        });
      }
    }
  }

  const elapsed = Date.now() - startedAt;
  const totalCreated = results.reduce((s, r) => s + r.created, 0);
  const errors       = results.filter(r => r.error);

  console.log(`[iCal cron] ${results.length} fontes sincronizadas, ${totalCreated} bloqueios criados, ${errors.length} erros — ${elapsed}ms`);

  return NextResponse.json({
    ok:           errors.length === 0,
    attempted:    results.length,
    synced:       results.length - errors.length,
    totalCreated,
    errors:       errors.length,
    elapsedMs:    elapsed,
    results,
    timestamp:    new Date().toISOString(),
  }, { status: errors.length ? 502 : 200, headers: { "Cache-Control": "no-store" } });
}
