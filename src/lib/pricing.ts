/**
 * Dynamic pricing calculation — modelo DIÁRIAS (dias de presença).
 * checkIn e checkOut são AMBOS contados (sexta + sábado + domingo = 3 diárias).
 *
 * Para cada diária, encontra a regra de maior prioridade ativa e aplica.
 * Ordem de prioridade:
 *   PACKAGE        → 20 (desconto de pacote: preço fixo total)
 *   HOLIDAY        → 10 (feriado específico com data)
 *   HOLIDAY_BASE   →  8 (coeficiente global de feriados — bate em feriados conhecidos)
 *   WEEKDAY/WEEKEND →  5 (dia da semana)
 */

// Feriados nacionais Brasil (2025-2027) — usado pelo HOLIDAY_BASE
const KNOWN_HOLIDAYS = new Set([
  // 2025
  "2025-01-01","2025-02-28","2025-03-01","2025-03-02",
  "2025-04-18","2025-04-20","2025-04-21","2025-05-01",
  "2025-06-19","2025-09-07","2025-10-12","2025-11-02",
  "2025-11-15","2025-11-20","2025-12-25",
  // 2026
  "2026-01-01","2026-02-13","2026-02-16","2026-02-17",
  "2026-04-03","2026-04-05","2026-04-21","2026-05-01",
  "2026-06-04","2026-09-07","2026-10-12","2026-11-02",
  "2026-11-15","2026-11-20","2026-12-25",
  // 2027
  "2027-01-01","2027-02-26","2027-03-01","2027-03-02",
  "2027-03-26","2027-03-28","2027-04-21","2027-05-01",
  "2027-06-24","2027-09-07","2027-10-12","2027-11-02",
  "2027-11-15","2027-11-20","2027-12-25",
]);

export interface PricingRule {
  id: string;
  name: string;
  type: string;
  daysOfWeek: string | null;   // JSON "[5,6]"
  startDate: Date | null;
  endDate: Date | null;
  priceType: string;           // "MULTIPLIER" | "FIXED" | "PACKAGE"
  value: number;
  priority: number;
  active: boolean;
  minNights?: number;
}

export interface NightPrice {
  date: string;        // "2025-12-25"
  basePrice: number;
  finalPrice: number;
  ruleName?: string;
}

/** Convert any Date to UTC date-only string "YYYY-MM-DD" */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Calculate the total accommodation amount (without cleaning fee).
 * Uses DIÁRIAS model: both checkIn and checkOut days are counted.
 */
export function calculateDynamicTotal(
  checkIn: Date,
  checkOut: Date,
  basePrice: number,
  rules: PricingRule[]
): { total: number; nights: NightPrice[] } {
  const activeRules = rules.filter(r => r.active && r.type !== "PACKAGE");
  const result: NightPrice[] = [];

  // Iterate from checkIn to checkOut INCLUSIVE (diárias model)
  const cur = new Date(checkIn);
  cur.setUTCHours(12, 0, 0, 0); // normalize to noon UTC to avoid DST edge cases

  const end = new Date(checkOut);
  end.setUTCHours(12, 0, 0, 0);

  while (cur <= end) {
    const night = applyBestRule(new Date(cur), basePrice, activeRules);
    result.push(night);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return {
    total: Math.round(result.reduce((sum, n) => sum + n.finalPrice, 0) * 100) / 100,
    nights: result,
  };
}

function applyBestRule(date: Date, basePrice: number, rules: PricingRule[]): NightPrice {
  const dateStr = toDateStr(date);
  const dayOfWeek = date.getUTCDay(); // 0=Sun … 6=Sat

  // Find all matching rules, pick highest priority
  const matching = rules
    .filter(r => ruleMatches(r, date, dateStr, dayOfWeek))
    .sort((a, b) => b.priority - a.priority);

  if (matching.length === 0) {
    return { date: dateStr, basePrice, finalPrice: roundMoney(basePrice) };
  }

  const rule = matching[0];

  // PACKAGE rules store a fixed TOTAL for the whole stay, not a per-day amount.
  // When used day-by-day here we treat the value as a per-day override.
  // (PACKAGE total is applied separately at the booking level when the full range matches.)
  const finalPrice =
    rule.priceType === "FIXED" || rule.priceType === "PACKAGE"
      ? roundMoney(rule.value)
      : Math.round(basePrice * rule.value * 100) / 100;

  return { date: dateStr, basePrice, finalPrice, ruleName: rule.name };
}

function ruleMatches(
  rule: PricingRule,
  date: Date,
  dateStr: string,
  dayOfWeek: number
): boolean {
  // ── Specific date-range rule (HOLIDAY, PACKAGE with dates) ────────────────
  if (rule.startDate && rule.endDate) {
    const s = toDateStr(new Date(rule.startDate));
    const e = toDateStr(new Date(rule.endDate));
    return dateStr >= s && dateStr <= e;
  }

  // ── Day-of-week rule (WEEKDAY, WEEKEND) ───────────────────────────────────
  if (rule.daysOfWeek) {
    try {
      const days: number[] = JSON.parse(rule.daysOfWeek);
      return days.includes(dayOfWeek);
    } catch {
      return false;
    }
  }

  // ── HOLIDAY_BASE: global holiday coefficient ───────────────────────────────
  // Matches any date in the known national holidays list.
  // Lower priority (8) than specific HOLIDAY rules (10), so specific rules win.
  if (rule.type === "HOLIDAY_BASE") {
    return KNOWN_HOLIDAYS.has(dateStr);
  }

  return false;
}

export function formatRuleDescription(rule: PricingRule): string {
  const pricePart =
    rule.priceType === "FIXED"
      ? `R$ ${rule.value.toFixed(2).replace(".", ",")}/diária`
      : `${rule.value >= 1 ? "+" : ""}${((rule.value - 1) * 100).toFixed(0)}%`;

  if (rule.daysOfWeek) {
    const days = (JSON.parse(rule.daysOfWeek) as number[])
      .map(d => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d])
      .join(", ");
    return `${days} → ${pricePart}`;
  }
  if (rule.startDate && rule.endDate) {
    const s = new Date(rule.startDate).toLocaleDateString("pt-BR");
    const e = new Date(rule.endDate).toLocaleDateString("pt-BR");
    return `${s} – ${e} → ${pricePart}`;
  }
  return pricePart;
}

export class PricingError extends Error {
  constructor(message: string, public readonly status = 422) { super(message); this.name = "PricingError"; }
}

export const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function parseReservationDate(value: unknown): Date {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(text)) throw new PricingError("Informe uma data válida no formato AAAA-MM-DD.", 400);
  const day = text.slice(0, 10);
  const date = new Date(day + "T00:00:00.000Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) throw new PricingError("Data inválida.", 400);
  return date;
}

export function parseReservationStay(checkIn: unknown, checkOut: unknown, allowPast = true) {
  const ci = parseReservationDate(checkIn), co = parseReservationDate(checkOut);
  const nightCount = Math.round((co.getTime() - ci.getTime()) / 86400000);
  if (nightCount < 0 || nightCount > 365) throw new PricingError("Selecione um período válido de até 366 diárias.", 400);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  if (!allowPast && ci.toISOString().slice(0, 10) < today) throw new PricingError("Não é possível reservar datas passadas.", 400);
  return { checkIn: ci, checkOut: co, nightCount, diarias: nightCount + 1 };
}

export interface PricingProperty {
  basePrice: number; cleaningFee: number; commissionRate: number;
  idealGuests: number; maxGuests: number; extraGuestFee: number; pricingRules: PricingRule[];
}

export function calculateReservationQuote(property: PricingProperty, checkIn: Date, checkOut: Date, guests: unknown, manualTotal?: unknown) {
  const stay = parseReservationStay(checkIn, checkOut);
  const guestCount = typeof guests === "number" || typeof guests === "string" ? Number(guests) : NaN;
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > property.maxGuests) throw new PricingError(`Informe de 1 a ${property.maxGuests} hóspedes.`);
  if (![property.basePrice, property.cleaningFee, property.extraGuestFee, property.commissionRate].every(n => Number.isFinite(n) && n >= 0) || property.commissionRate > 100) throw new PricingError("As tarifas do imóvel precisam ser revisadas.", 503);
  let minRequired = 1;
  for (const rule of property.pricingRules.filter(rule => rule.active)) {
    if (!["PACKAGE", "WEEKEND"].includes(rule.type)) continue;
    if (ruleMatches(rule, checkIn, toDateStr(checkIn), checkIn.getUTCDay())) minRequired = Math.max(minRequired, rule.minNights ?? 1);
  }
  if (stay.diarias < minRequired) throw new PricingError(`Estadia mínima para este período: ${minRequired} diárias.`);
  const dynamic = calculateDynamicTotal(checkIn, checkOut, property.basePrice, property.pricingRules);
  if (!Number.isFinite(dynamic.total) || dynamic.nights.some(day => day.finalPrice < 0)) throw new PricingError("As tarifas do imóvel precisam ser revisadas.", 503);
  const extraGuestTotal = roundMoney(Math.max(0, guestCount - property.idealGuests) * property.extraGuestFee * stay.diarias);
  const cleaningFee = roundMoney(property.cleaningFee);
  const totalAmount = manualTotal === undefined ? roundMoney(dynamic.total + extraGuestTotal + cleaningFee) : roundMoney(Number(manualTotal));
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new PricingError("O total deve ser um valor positivo.");
  const commission = roundMoney(totalAmount * property.commissionRate / 100);
  const ownerAmount = roundMoney(totalAmount - commission - cleaningFee);
  if (ownerAmount < 0) throw new PricingError("O total não cobre a limpeza e a comissão.");
  const groups: { label: string; count: number; unitPrice: number; subtotal: number }[] = [];
  for (const day of dynamic.nights) {
    const label = day.ruleName ?? "Diária padrão", last = groups[groups.length - 1];
    if (last && last.label === label && last.unitPrice === day.finalPrice) { last.count++; last.subtotal = roundMoney(last.subtotal + day.finalPrice); }
    else groups.push({ label, count: 1, unitPrice: day.finalPrice, subtotal: day.finalPrice });
  }
  return { totalAmount, accommodationTotal: dynamic.total, cleaningFee, extraGuestTotal, commission, ownerAmount,
    guestCount, diarias: stay.diarias, nightCount: stay.nightCount, basePrice: property.basePrice, groups,
    hasVariation: dynamic.total !== roundMoney(property.basePrice * stay.diarias), minRequired, usingDefaults: false };
}
