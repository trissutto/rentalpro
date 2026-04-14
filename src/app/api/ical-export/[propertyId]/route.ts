import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/ical-export/[propertyId]
 *
 * Gera um arquivo .ics público com todas as reservas confirmadas
 * e bloqueios manuais do imóvel.
 *
 * Cole essa URL no Airbnb em:
 *   Calendário → Disponibilidade → Sincronizar calendários → Importar calendário
 *
 * NÃO requer autenticação — a URL é o "segredo" (o propertyId é opaco).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { propertyId: string } }
) {
  const { propertyId } = params;

  // 1. Load property
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, name: true } as any,
  });
  if (!property) {
    return new NextResponse("Imóvel não encontrado", { status: 404 });
  }

  const propName = (property as any).name ?? "Imóvel";

  // 2. Load confirmed/checked-in reservations
  const now = new Date();
  const reservations: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, code, guestName, checkIn, checkOut
     FROM reservations
     WHERE propertyId = ?
       AND status IN ('CONFIRMED','CHECKED_IN','PENDING')
       AND checkOut >= ?
     ORDER BY checkIn ASC`,
    propertyId,
    now.toISOString(),
  );

  // 3. Load manual + owner-use blocks (not ICAL — avoids re-exporting what was imported)
  let blocks: any[] = [];
  try {
    blocks = await (prisma as any).$queryRawUnsafe(
      `SELECT id, reason, startDate, endDate
       FROM date_blocks
       WHERE propertyId = ?
         AND type != 'ICAL'
         AND endDate >= ?
       ORDER BY startDate ASC`,
      propertyId,
      now.toISOString(),
    );
  } catch {
    // Table may not exist yet
  }

  // 4. Build iCal string
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RentalPro//Calendar//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${propName}`,
    "X-WR-TIMEZONE:America/Sao_Paulo",
  ];

  function toIcalDate(iso: string): string {
    // Returns YYYYMMDD from any ISO string
    return iso.slice(0, 10).replace(/-/g, "");
  }

  function toIcalDateTime(iso: string): string {
    // Returns YYYYMMDDTHHMMSSZ
    return iso.replace(/[-:]/g, "").replace(/\.\d+/, "").replace(" ", "T");
  }

  const stamp = toIcalDateTime(now.toISOString());

  // Reservations → VEVENT
  for (const res of reservations) {
    const uid     = `res-${res.id}@rentalpro`;
    const summary = `Reservado — ${res.guestName ?? "Hóspede"}`;
    const dtstart = toIcalDate(res.checkIn);
    const dtend   = toIcalDate(res.checkOut);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${summary}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  // Blocks → VEVENT
  for (const blk of blocks) {
    const uid     = `blk-${blk.id}@rentalpro`;
    const summary = blk.reason ?? "Bloqueado";
    const dtstart = toIcalDate(blk.startDate);
    // iCal DTEND is exclusive, so add 1 day for all-day events
    const endDate = new Date(blk.endDate);
    endDate.setDate(endDate.getDate() + 1);
    const dtend = toIcalDate(endDate.toISOString());

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${summary}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  const icsContent = lines.join("\r\n") + "\r\n";

  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      "Content-Type":        "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${propertyId}.ics"`,
      "Cache-Control":       "no-cache, no-store, must-revalidate",
    },
  });
}
