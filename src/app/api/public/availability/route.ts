import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/public/availability?propertyId=X&months=3
 *
 * Retorna:
 *  - occupiedDates: string[] de datas bloqueadas (YYYY-MM-DD) por reservas confirmadas/pending
 *  - minNightsRules: regras de estadia mínima ativas (PACKAGE e WEEKEND)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const months = parseInt(searchParams.get("months") ?? "4", 10);

  if (!propertyId) {
    return NextResponse.json({ error: "propertyId obrigatório" }, { status: 400 });
  }

  // Janela de busca: hoje até N meses à frente
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const future = new Date(today);
  future.setMonth(future.getMonth() + months);

  // ── 1. Datas ocupadas ─────────────────────────────────────────────────────
  const reservations = await prisma.reservation.findMany({
    where: {
      propertyId,
      status: { in: ["CONFIRMED", "CHECKED_IN", "PENDING"] },
      checkOut: { gte: today },
      checkIn:  { lte: future },
    },
    select: { checkIn: true, checkOut: true, status: true },
  });

  const occupiedDates = new Set<string>();

  function markRange(start: Date, end: Date) {
    const cur = new Date(start); cur.setUTCHours(12, 0, 0, 0);
    const fin = new Date(end);   fin.setUTCHours(12, 0, 0, 0);
    while (cur <= fin) {
      occupiedDates.add(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  for (const res of reservations) markRange(res.checkIn, res.checkOut);

  // ── 1b. Bloqueios manuais e iCal ─────────────────────────────────────────
  const dateBlocks = await (prisma as any).dateBlock.findMany({
    where: {
      propertyId,
      endDate:   { gte: today },
      startDate: { lte: future },
    },
    select: { startDate: true, endDate: true },
  });
  for (const blk of dateBlocks) markRange(blk.startDate, blk.endDate);

  // ── 2. Regras de estadia mínima ───────────────────────────────────────────
  const allRules = await prisma.pricingRule.findMany({
    where: {
      propertyId,
      active: true,
      type: { in: ["PACKAGE", "WEEKEND"] },
    },
    // Não limitamos o select para incluir minNights mesmo que os tipos Prisma estejam desatualizados
  });

  // Normaliza as regras para o cliente
  const minNightsRules = allRules
    .filter((r) => {
      // Ignora regras sem minNights significativo
      const mn = (r as unknown as Record<string, number>).minNights ?? 1;
      return mn > 1;
    })
    .map((r) => ({
      name: r.name,
      type: r.type,
      daysOfWeek: r.daysOfWeek ? JSON.parse(r.daysOfWeek) : null,
      startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
      endDate:   r.endDate   ? r.endDate.toISOString().slice(0, 10)   : null,
      minNights: (r as unknown as Record<string, number>).minNights ?? 1,
    }));

  return NextResponse.json({
    occupiedDates: Array.from(occupiedDates).sort(),
    minNightsRules,
  });
}
