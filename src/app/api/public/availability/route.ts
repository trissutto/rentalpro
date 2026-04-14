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
  try {
    const dateBlocks: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT startDate, endDate FROM date_blocks
       WHERE propertyId = ? AND endDate >= ? AND startDate <= ?`,
      propertyId, today.toISOString(), future.toISOString()
    );
    for (const blk of dateBlocks) markRange(new Date(blk.startDate), new Date(blk.endDate));
  } catch {
    // Table may not exist yet — skip blocks
  }

  // ── 2. Todas as regras ativas ─────────────────────────────────────────────
  const allRules = await prisma.pricingRule.findMany({
    where: { propertyId, active: true },
  });

  // Regras de estadia mínima (PACKAGE e WEEKEND com minNights > 1)
  const minNightsRules = allRules
    .filter((r) => {
      if (!["PACKAGE", "WEEKEND"].includes(r.type)) return false;
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

  // Coeficientes reais de preço (HOLIDAY_BASE e WEEKEND)
  const holidayRule  = allRules.find(r => r.type === "HOLIDAY_BASE" && r.priceType === "MULTIPLIER");
  const weekendRule  = allRules.find(r => r.type === "WEEKEND"      && r.priceType === "MULTIPLIER");
  const weekdayRule  = allRules.find(r => r.type === "WEEKDAY"      && r.priceType === "MULTIPLIER");

  const pricingCoeffs = {
    holiday: holidayRule ? Number(holidayRule.value) : 1.3,
    weekend: weekendRule ? Number(weekendRule.value) : 1.2,
    weekday: weekdayRule ? Number(weekdayRule.value) : 1.0,
  };

  return NextResponse.json({
    occupiedDates: Array.from(occupiedDates).sort(),
    minNightsRules,
    pricingCoeffs,
  });
}
