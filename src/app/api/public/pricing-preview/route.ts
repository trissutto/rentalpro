import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Feriados nacionais Brasil 2025-2027 ───────────────────────────────────────
const KNOWN_HOLIDAYS = new Set([
  "2025-01-01","2025-02-28","2025-03-01","2025-03-02",
  "2025-04-18","2025-04-20","2025-04-21","2025-05-01",
  "2025-06-19","2025-09-07","2025-10-12","2025-11-02",
  "2025-11-15","2025-11-20","2025-12-25",
  "2026-01-01","2026-02-13","2026-02-16","2026-02-17",
  "2026-04-03","2026-04-05","2026-04-21","2026-05-01",
  "2026-06-04","2026-09-07","2026-10-12","2026-11-02",
  "2026-11-15","2026-11-20","2026-12-25",
  "2027-01-01","2027-02-26","2027-03-01","2027-03-02",
  "2027-03-26","2027-03-28","2027-04-21","2027-05-01",
  "2027-06-24","2027-09-07","2027-10-12","2027-11-02",
  "2027-11-15","2027-11-20","2027-12-25",
]);

interface PricingRule {
  id: string;
  name: string;
  type: string;
  daysOfWeek: string | null;
  startDate: Date | null;
  endDate: Date | null;
  priceType: string;
  value: number;
  priority: number;
  active: boolean;
}

// Regras padrão usadas como fallback quando a propriedade não tem nenhuma regra configurada.
// Se a propriedade tiver pelo menos uma regra de cada tipo, os defaults NÃO são usados.
const DEFAULT_RULES: PricingRule[] = [
  {
    id: "__default_holiday__",
    name: "Feriado",
    type: "HOLIDAY_BASE",
    daysOfWeek: null,
    startDate: null,
    endDate: null,
    priceType: "MULTIPLIER",
    value: 1.3,    // +30% em feriados nacionais
    priority: 8,
    active: true,
  },
  {
    id: "__default_weekend__",
    name: "Fim de semana",
    type: "WEEKEND",
    daysOfWeek: "[5,6,0]", // Sex, Sáb, Dom
    startDate: null,
    endDate: null,
    priceType: "MULTIPLIER",
    value: 1.2,    // +20% em fins de semana
    priority: 5,
    active: true,
  },
];

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function ruleMatches(rule: PricingRule, dateStr: string, utcDay: number): boolean {
  // Date-range rule (HOLIDAY specific date, PACKAGE)
  if (rule.startDate && rule.endDate) {
    const s = toDateStr(new Date(rule.startDate));
    const e = toDateStr(new Date(rule.endDate));
    return dateStr >= s && dateStr <= e;
  }
  // Day-of-week rule (WEEKDAY, WEEKEND)
  if (rule.daysOfWeek) {
    try {
      const days: number[] = JSON.parse(rule.daysOfWeek);
      return days.includes(utcDay);
    } catch { return false; }
  }
  // HOLIDAY_BASE — bate em qualquer feriado nacional conhecido
  if (rule.type === "HOLIDAY_BASE") {
    return KNOWN_HOLIDAYS.has(dateStr);
  }
  return false;
}

interface DayPrice {
  date: string;
  finalPrice: number;
  ruleName?: string;
}

function priceForDay(
  dateStr: string,
  utcDay: number,
  basePrice: number,
  rules: PricingRule[]
): DayPrice {
  const matching = rules
    .filter((r) => r.active && ruleMatches(r, dateStr, utcDay))
    .sort((a, b) => b.priority - a.priority);

  if (matching.length === 0) return { date: dateStr, finalPrice: basePrice };

  const rule = matching[0];
  const finalPrice =
    rule.priceType === "FIXED"
      ? rule.value
      : Math.round(basePrice * rule.value * 100) / 100;

  return { date: dateStr, finalPrice, ruleName: rule.name };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const checkIn    = searchParams.get("checkIn");
  const checkOut   = searchParams.get("checkOut");

  if (!propertyId || !checkIn || !checkOut) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { basePrice: true },
  });
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  // Busca regras ativas (exceto PACKAGE que tem preço total, não por diária)
  const dbRules = (await prisma.pricingRule.findMany({
    where: { propertyId, active: true, type: { notIn: ["PACKAGE"] } },
  })) as PricingRule[];

  // ── Fallback inteligente ───────────────────────────────────────────────────
  // Se não há regra de feriado configurada → usa default HOLIDAY_BASE 1.3×
  // Se não há regra de fim de semana configurada → usa default WEEKEND 1.2×
  const hasHolidayRule = dbRules.some(
    (r) => r.type === "HOLIDAY_BASE" || r.type === "HOLIDAY"
  );
  const hasWeekendRule = dbRules.some(
    (r) => r.type === "WEEKEND" || r.type === "WEEKDAY"
  );

  const rules: PricingRule[] = [
    ...dbRules,
    ...(hasHolidayRule ? [] : [DEFAULT_RULES[0]]),  // default HOLIDAY_BASE
    ...(hasWeekendRule ? [] : [DEFAULT_RULES[1]]),  // default WEEKEND
  ];

  const basePrice = property.basePrice;

  // ── Diárias model: checkIn inclusive → checkOut inclusive ──────────────────
  const days: DayPrice[] = [];
  const cur = new Date(checkIn + "T12:00:00Z");
  const end = new Date(checkOut + "T12:00:00Z");

  while (cur <= end) {
    const ds  = toDateStr(cur);
    const dow = cur.getUTCDay();
    days.push(priceForDay(ds, dow, basePrice, rules));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const accommodationTotal =
    Math.round(days.reduce((s, d) => s + d.finalPrice, 0) * 100) / 100;
  const flatTotal = Math.round(basePrice * days.length * 100) / 100;
  const hasVariation = Math.abs(accommodationTotal - flatTotal) > 0.01;

  // Agrupa dias consecutivos com a mesma tarifa
  interface Group {
    label: string;
    count: number;
    unitPrice: number;
    subtotal: number;
  }
  const groups: Group[] = [];
  for (const day of days) {
    const label = day.ruleName ?? "Diária padrão";
    const last  = groups[groups.length - 1];
    if (
      last &&
      last.label === label &&
      Math.abs(last.unitPrice - day.finalPrice) < 0.01
    ) {
      last.count++;
      last.subtotal =
        Math.round((last.subtotal + day.finalPrice) * 100) / 100;
    } else {
      groups.push({
        label,
        count: 1,
        unitPrice: day.finalPrice,
        subtotal: day.finalPrice,
      });
    }
  }

  return NextResponse.json({
    basePrice,
    accommodationTotal,
    diarias: days.length,
    hasVariation,
    groups,
    usingDefaults: !hasHolidayRule || !hasWeekendRule, // debug info
  });
}
