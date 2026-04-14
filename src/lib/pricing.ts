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

interface PricingRule {
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
  const activeRules = rules.filter(r => r.active);
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
    return { date: dateStr, basePrice, finalPrice: basePrice };
  }

  const rule = matching[0];

  // PACKAGE rules store a fixed TOTAL for the whole stay, not a per-day amount.
  // When used day-by-day here we treat the value as a per-day override.
  // (PACKAGE total is applied separately at the booking level when the full range matches.)
  const finalPrice =
    rule.priceType === "FIXED" || rule.priceType === "PACKAGE"
      ? rule.value
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
