import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const HOLIDAYS_2026 = [
  { date: "2026-01-01", name: "Ano Novo" },
  { date: "2026-02-13", name: "Carnaval (sexta)" },
  { date: "2026-02-16", name: "Carnaval" },
  { date: "2026-02-17", name: "Carnaval" },
  { date: "2026-04-03", name: "Sexta-feira Santa" },
  { date: "2026-04-05", name: "Páscoa" },
  { date: "2026-04-21", name: "Tiradentes" },
  { date: "2026-05-01", name: "Dia do Trabalho" },
  { date: "2026-06-04", name: "Corpus Christi" },
  { date: "2026-09-07", name: "Independência do Brasil" },
  { date: "2026-10-12", name: "Nossa Senhora Aparecida" },
  { date: "2026-11-02", name: "Finados" },
  { date: "2026-11-15", name: "Proclamação da República" },
  { date: "2026-11-20", name: "Consciência Negra" },
  { date: "2026-12-25", name: "Natal" },
];

const HOLIDAYS_2027 = [
  { date: "2027-01-01", name: "Ano Novo" },
  { date: "2027-02-26", name: "Carnaval (sexta)" },
  { date: "2027-03-01", name: "Carnaval" },
  { date: "2027-03-02", name: "Carnaval" },
  { date: "2027-03-26", name: "Sexta-feira Santa" },
  { date: "2027-03-28", name: "Páscoa" },
  { date: "2027-04-21", name: "Tiradentes" },
  { date: "2027-05-01", name: "Dia do Trabalho" },
  { date: "2027-06-24", name: "Corpus Christi" },
  { date: "2027-09-07", name: "Independência do Brasil" },
  { date: "2027-10-12", name: "Nossa Senhora Aparecida" },
  { date: "2027-11-02", name: "Finados" },
  { date: "2027-11-15", name: "Proclamação da República" },
  { date: "2027-11-20", name: "Consciência Negra" },
  { date: "2027-12-25", name: "Natal" },
];

// ─── Special packages ────────────────────────────────────────────────────────
// Natal (1.5×) e Carnaval (1.5×): janela de 5 diárias
// Ano Novo (2.0×): janela de 5 diárias, começa em dezembro do ano anterior
//
//  ANO NOVO 2026 → 30/12/2025 – 03/01/2026  (5 diárias)
//  ANO NOVO 2027 → 29/12/2026 – 02/01/2027  (5 diárias)
//  NATAL 2026    → 23/12/2026 – 27/12/2026  (5 diárias)
//  NATAL 2027    → 22/12/2027 – 26/12/2027  (5 diárias)
//  CARNAVAL 2026 → 13/02/2026 – 17/02/2026  (5 diárias, Sex→Ter)
//  CARNAVAL 2027 → 26/02/2027 – 02/03/2027  (5 diárias, Sex→Ter)
// ─────────────────────────────────────────────────────────────────────────────
const SPECIAL_PACKAGES: Record<
  number,
  { name: string; startDate: string; endDate: string; multiplier: number; days: number }[]
> = {
  2026: [
    // Ano Novo 2026: começa em 30/12/2025 (ano anterior!)
    {
      name: "Pacote Ano Novo 2026 🎆",
      startDate: "2025-12-30",
      endDate: "2026-01-03",
      multiplier: 2.0,
      days: 5,
    },
    // Carnaval 2026: Sex 13/02 → Ter 17/02
    {
      name: "Pacote Carnaval 2026 🎭",
      startDate: "2026-02-13",
      endDate: "2026-02-17",
      multiplier: 1.5,
      days: 5,
    },
    // Natal 2026: Qua 23/12 → Dom 27/12
    {
      name: "Pacote Natal 2026 🎄",
      startDate: "2026-12-23",
      endDate: "2026-12-27",
      multiplier: 1.5,
      days: 5,
    },
  ],
  2027: [
    // Ano Novo 2027: começa em 29/12/2026 (ano anterior!)
    {
      name: "Pacote Ano Novo 2027 🎆",
      startDate: "2026-12-29",
      endDate: "2027-01-02",
      multiplier: 2.0,
      days: 5,
    },
    // Carnaval 2027: Sex 26/02 → Ter 02/03
    {
      name: "Pacote Carnaval 2027 🎭",
      startDate: "2027-02-26",
      endDate: "2027-03-02",
      multiplier: 1.5,
      days: 5,
    },
    // Natal 2027: Qua 22/12 → Dom 26/12
    {
      name: "Pacote Natal 2027 🎄",
      startDate: "2027-12-22",
      endDate: "2027-12-26",
      multiplier: 1.5,
      days: 5,
    },
  ],
};

// Dates in HOLIDAYS_xxxx that are already covered by a special package.
// These holiday dates will be skipped (no individual MULTIPLIER rule created).
const SPECIAL_PACKAGE_DATES: Record<number, Set<string>> = {
  2026: new Set([
    // Ano Novo 2026 (Jan 1 is in the package window)
    "2026-01-01", "2026-01-02", "2026-01-03",
    // Carnaval 2026
    "2026-02-13", "2026-02-14", "2026-02-15", "2026-02-16", "2026-02-17",
    // Natal 2026
    "2026-12-23", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-27",
  ]),
  2027: new Set([
    // Ano Novo 2027 (Jan 1, 2027 is in the package window)
    "2027-01-01", "2027-01-02",
    // Carnaval 2027
    "2027-02-26", "2027-02-27", "2027-02-28", "2027-03-01", "2027-03-02",
    // Natal 2027
    "2027-12-22", "2027-12-23", "2027-12-24", "2027-12-25", "2027-12-26",
  ]),
};

interface Holiday {
  date: string;
  name: string;
}

function getPackageDates(holidayDateStr: string): { start: string; end: string } | null {
  const d = new Date(holidayDateStr + "T12:00:00");
  const dow = d.getDay(); // 0=Sun,1=Mon,...,5=Fri,6=Sat

  if (dow === 5) {
    // Friday → Fri+Sat+Sun (3 diárias)
    const end = new Date(d);
    end.setDate(end.getDate() + 2);
    return { start: holidayDateStr, end: end.toISOString().slice(0, 10) };
  }

  if (dow === 1) {
    // Monday → Sat+Sun+Mon (3 diárias)
    const start = new Date(d);
    start.setDate(start.getDate() - 2);
    return { start: start.toISOString().slice(0, 10), end: holidayDateStr };
  }

  return null; // no long weekend
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { propertyId, year, baseMultiplier } = body;

  if (!propertyId || !year || baseMultiplier === undefined) {
    return NextResponse.json({ error: "propertyId, year, and baseMultiplier required" }, { status: 400 });
  }

  const holidays: Holiday[] = year === 2026 ? HOLIDAYS_2026 : year === 2027 ? HOLIDAYS_2027 : [];
  if (holidays.length === 0) {
    return NextResponse.json({ error: "Year not supported (only 2026, 2027)" }, { status: 400 });
  }

  // Fetch property base price for special package value calculation
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { basePrice: true },
  });
  const basePrice = property?.basePrice ?? 0;

  // ── Delete existing HOLIDAY rules for this year ───────────────────────────
  await prisma.pricingRule.deleteMany({
    where: {
      propertyId,
      type: "HOLIDAY",
      startDate: {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31`),
      },
    },
  });

  // ── Delete existing PACKAGE rules ─────────────────────────────────────────
  // Expand range to December of the PREVIOUS year so that Ano Novo packages
  // (which start on Dec 30/29 of year-1) are also cleaned up on regeneration.
  await prisma.pricingRule.deleteMany({
    where: {
      propertyId,
      type: "PACKAGE",
      startDate: {
        gte: new Date(`${year - 1}-12-01`),
        lte: new Date(`${year}-12-31`),
      },
    },
  });

  const specialDates = SPECIAL_PACKAGE_DATES[year] ?? new Set<string>();

  let createdCount = 0;
  let packageCount = 0;
  let holidayCount = 0;

  // ── 1. Individual HOLIDAY multiplier rules (skip dates in special packages) ──
  for (const holiday of holidays) {
    if (specialDates.has(holiday.date)) continue; // covered by special package

    await prisma.pricingRule.create({
      data: {
        propertyId,
        name: holiday.name,
        type: "HOLIDAY",
        priceType: "MULTIPLIER",
        value: baseMultiplier,
        startDate: new Date(holiday.date + "T12:00:00"),
        endDate: new Date(holiday.date + "T12:00:00"),
        priority: 10,
        minNights: 1,
        active: true,
      },
    } as Parameters<typeof prisma.pricingRule.create>[0]);
    createdCount++;
    holidayCount++;

    // Regular 3-day long weekend package (Fri/Mon holidays only)
    const packageDates = getPackageDates(holiday.date);
    if (packageDates) {
      const packageName = `Pacote ${holiday.name} ${year}`;
      await prisma.pricingRule.create({
        data: {
          propertyId,
          name: packageName,
          type: "PACKAGE",
          priceType: "PACKAGE",
          value: 0, // Price TBD by user
          startDate: new Date(packageDates.start + "T12:00:00"),
          endDate: new Date(packageDates.end + "T12:00:00"),
          priority: 5,
          minNights: 3,  // mínimo 3 noites no feriado prolongado
          active: true,
        },
      } as Parameters<typeof prisma.pricingRule.create>[0]);
      createdCount++;
      packageCount++;
    }
  }

  // ── 2. Special packages: Ano Novo (2×), Natal (1.5×), Carnaval (1.5×) ────
  // Priority 20 → always overrides individual HOLIDAY rules (priority 10)
  const specialPackages = SPECIAL_PACKAGES[year] ?? [];
  for (const pkg of specialPackages) {
    const pkgValue = Math.round(basePrice * pkg.multiplier * pkg.days * 100) / 100;

    await prisma.pricingRule.create({
      data: {
        propertyId,
        name: pkg.name,
        type: "PACKAGE",
        priceType: "PACKAGE",
        value: pkgValue,
        startDate: new Date(pkg.startDate + "T12:00:00"),
        endDate: new Date(pkg.endDate + "T12:00:00"),
        priority: 20,
        minNights: pkg.days,  // mínimo = toda a janela do pacote (5 noites)
        active: true,
      },
    } as Parameters<typeof prisma.pricingRule.create>[0]);
    createdCount++;
    packageCount++;
  }

  return NextResponse.json(
    {
      created: createdCount,
      packages: packageCount,
      holidays: holidayCount,
      specialPackages: specialPackages.length,
    },
    { status: 201 }
  );
}
