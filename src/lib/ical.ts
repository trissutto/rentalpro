/** Calendar imports are validated completely before replacing saved blocks. */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export class ICalSyncError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "ICalSyncError";
  }
}

export interface ICalEvent {
  summary: string;
  dtstart: string; // YYYY-MM-DD, inclusive
  dtend: string;   // YYYY-MM-DD, exclusive (iCalendar convention)
  uid: string;
}

export interface ICalSource {
  url: string;
  label: string;
  source: string;
}

export function normalizeIcalUrl(input: string): string {
  try {
    const url = new URL(input.trim().replace(/^webcal:/i, "https:"));
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    url.hash = "";
    return url.toString();
  } catch {
    throw new ICalSyncError("Informe uma URL HTTP(S) válida de exportação iCal.", 400);
  }
}

export function readIcalSources(value: string | null | undefined): ICalSource[] {
  try {
    const entries: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(entries)) throw new Error();
    return entries.map((entry) => {
      if (!entry || typeof entry.url !== "string" || typeof entry.source !== "string" || !entry.source.trim()) throw new Error();
      return {
        url: normalizeIcalUrl(entry.url),
        label: typeof entry.label === "string" ? entry.label : entry.source,
        source: entry.source,
      };
    });
  } catch {
    throw new ICalSyncError("A configuração dos calendários salvos é inválida. Os bloqueios foram preservados.", 500);
  }
}

export function parseIcalDate(raw: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T([0-2]\d)([0-5]\d)([0-5]\d)Z?)?$/.exec(raw);
  if (!match || (match[4] && Number(match[4]) > 23)) throw new ICalSyncError("O calendário contém uma data inválida.");
  const date = match[1] + "-" + match[2] + "-" + match[3];
  const parsed = new Date(date + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new ICalSyncError("O calendário contém uma data inválida.");
  }
  return date;
}

function nextDay(date: string, delta = 1): string {
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

function unescapeText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, escaped: string) => /[nN]/.test(escaped) ? "\n" : escaped);
}

/** Supports exported, non-recurring all-day stays and date-time events. */
export function parseIcal(text: string): ICalEvent[] {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").trim().split("\n");
  if (lines[0]?.trim().toUpperCase() !== "BEGIN:VCALENDAR" || lines.at(-1)?.trim().toUpperCase() !== "END:VCALENDAR") {
    throw new ICalSyncError("A URL não retornou um calendário iCal válido. Use o link de exportação do Airbnb.");
  }
  const events: ICalEvent[] = [];
  const seen = new Map<string, string>();
  const stack: string[] = [];
  let current: Record<string, string> | null = null;
  let version = false;
  let calendarSeen = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 1) throw new ICalSyncError("O calendário está incompleto ou malformado.");
    const key = line.slice(0, colon).split(";")[0].toUpperCase();
    const value = line.slice(colon + 1).trim();
    if (key === "BEGIN") {
      const component = value.toUpperCase();
      if (component === "VCALENDAR") {
        if (stack.length || calendarSeen) throw new ICalSyncError("O calendário está malformado.");
        calendarSeen = true;
      }
      if (component === "VEVENT") {
        if (stack.at(-1) !== "VCALENDAR") throw new ICalSyncError("O calendário contém um evento inválido.");
        current = {};
      }
      stack.push(component);
      continue;
    }
    if (key === "END") {
      const component = value.toUpperCase();
      if (stack.pop() !== component) throw new ICalSyncError("O calendário está incompleto ou malformado.");
      if (component === "VEVENT" && current) {
        if (current.STATUS?.toUpperCase() !== "CANCELLED" && current.TRANSP?.toUpperCase() !== "TRANSPARENT") {
          if (!current.UID || !current.DTSTART || !current.DTEND) {
            throw new ICalSyncError("Um evento não contém UID, DTSTART ou DTEND. Os bloqueios foram preservados.");
          }
          if (current.RRULE || current.RDATE || current.EXDATE || current["RECURRENCE-ID"]) {
            throw new ICalSyncError("O calendário contém recorrências não suportadas. Use o calendário de reservas exportado pela plataforma.");
          }
          const start = parseIcalDate(current.DTSTART);
          let end = parseIcalDate(current.DTEND);
          if (current.DTSTART.includes("T") !== current.DTEND.includes("T")) throw new ICalSyncError("O evento mistura formatos de data incompatíveis.");
          // A timed event occupies the last date unless it ends exactly at midnight.
          if (current.DTEND.includes("T") && !/T000000Z?$/.test(current.DTEND)) end = nextDay(end);
          if (current.DTSTART >= current.DTEND || start >= end) throw new ICalSyncError("O calendário contém um período inválido.");
          const event = { uid: current.UID, summary: unescapeText(current.SUMMARY ?? ""), dtstart: start, dtend: end };
          const serialized = JSON.stringify(event);
          if (seen.has(event.uid) && seen.get(event.uid) !== serialized) throw new ICalSyncError("O calendário contém eventos conflitantes com o mesmo UID.");
          if (!seen.has(event.uid)) events.push(event);
          seen.set(event.uid, serialized);
        }
        current = null;
      }
      continue;
    }
    if (!stack.length) throw new ICalSyncError("O calendário está malformado.");
    if (stack.length === 1 && key === "VERSION") version = value === "2.0";
    if (stack.at(-1) === "VEVENT" && current) current[key] = value;
  }
  if (stack.length || !version) throw new ICalSyncError("O calendário está incompleto ou usa uma versão não suportada.");
  return events;
}

function sourceForUrl(entries: ICalSource[], url: string, label: string, source?: string): string {
  const existing = entries.find(entry => entry.url === url);
  if (existing) return existing.source;
  const base = (source?.trim() || label.trim() || new URL(url).hostname).toLowerCase().slice(0, 40);
  if (!entries.some(entry => entry.source === base)) return base;
  return base.slice(0, 23) + "-" + createHash("sha256").update(url).digest("hex").slice(0, 16);
}

export async function syncIcalUrl(
  propertyId: string,
  inputUrl: string,
  label: string,
  source?: string,
): Promise<{ created: number; deleted: number; source: string }> {
  const url = normalizeIcalUrl(inputUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "ReservasIta-Sync/1.0", Accept: "text/calendar, text/plain;q=0.9" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ICalSyncError("Não foi possível acessar o calendário externo. Tente sincronizar novamente.");
  }
  if (!response.ok) throw new ICalSyncError("O calendário externo respondeu HTTP " + response.status + ". Verifique o link de exportação.");
  const events = parseIcal(await response.text());
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const future = events.filter(event => event.dtend > today);

  // External I/O and validation finish before acquiring the SQLite write transaction.
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<{ icalUrls: string }[]>(
      "SELECT icalUrls FROM properties WHERE id = ?", propertyId,
    );
    if (!rows.length) throw new ICalSyncError("Imóvel não encontrado.", 404);
    const entries = readIcalSources(rows[0].icalUrls);
    const sourceKey = sourceForUrl(entries, url, label, source);
    const deleted = await tx.$executeRawUnsafe(
      "DELETE FROM date_blocks WHERE propertyId = ? AND type = 'ICAL' AND source = ?", propertyId, sourceKey,
    );
    const now = new Date().toISOString();
    for (const event of future) {
      const id = "ical_" + createHash("sha256").update(JSON.stringify([propertyId, sourceKey, event.uid])).digest("hex");
      await tx.$executeRawUnsafe(
        "INSERT INTO date_blocks (id, propertyId, startDate, endDate, reason, type, source, createdAt) VALUES (?, ?, ?, ?, ?, 'ICAL', ?, ?)",
        id, propertyId,
        event.dtstart + "T00:00:00.000Z",
        nextDay(event.dtend, -1) + "T23:59:59.999Z",
        event.summary || label || sourceKey, sourceKey, now,
      );
    }
    const entry = { url, label: label.trim() || sourceKey, source: sourceKey };
    const index = entries.findIndex(saved => saved.url === url);
    if (index < 0) entries.push(entry); else entries[index] = entry;
    await tx.$executeRawUnsafe("UPDATE properties SET icalUrls = ? WHERE id = ?", JSON.stringify(entries), propertyId);
    return { created: future.length, deleted, source: sourceKey };
  }, { timeout: 20_000 });
}
