import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    // Build owner filter
    const ownerFilter = user.role === "OWNER" ? { owner: { id: user.id } } : undefined;

    // Fetch properties
    const properties = await prisma.property.findMany({
      where: ownerFilter,
      select: { id: true, name: true },
    });
    const propertyIds = properties.map((p) => p.id);

    // ── Revenue by month: fetch all transactions, group in JS ──────────────
    const transactions = propertyIds.length > 0
      ? await prisma.financialTransaction.findMany({
          where: {
            propertyId: { in: propertyIds },
            createdAt: { gte: twelveMonthsAgo },
          },
          select: { type: true, amount: true, createdAt: true },
        })
      : [];

    // Build 12-month skeleton
    const monthMap = new Map<string, { income: number; expenses: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
      monthMap.set(key, { income: 0, expenses: 0 });
    }

    transactions.forEach((t) => {
      const d = new Date(t.createdAt);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
      const existing = monthMap.get(key);
      if (existing) {
        if (t.type === "INCOME") existing.income += t.amount;
        else if (t.type === "EXPENSE") existing.expenses += t.amount;
      }
    });

    const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const revenueByMonth = Array.from(monthMap.entries()).map(([key, data]) => {
      const [mm, yy] = key.split("/");
      const label = `${MONTH_NAMES[parseInt(mm) - 1]}/${yy}`;
      return {
        month: label,
        receita: Math.round(data.income),
        despesas: Math.round(data.expenses),
        lucro: Math.round(data.income - data.expenses),
      };
    });

    // ── Occupancy by property (last 90 days) ───────────────────────────────
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const occupancyRaw = propertyIds.length > 0
      ? await prisma.reservation.groupBy({
          by: ["propertyId"],
          where: {
            propertyId: { in: propertyIds },
            status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
            checkIn: { gte: ninetyDaysAgo },
          },
          _sum: { nights: true },
          _count: { id: true },
        })
      : [];

    const occupancyByProperty = properties.map((prop) => {
      const occ = occupancyRaw.find((o) => o.propertyId === prop.id);
      const nights = occ?._sum.nights ?? 0;
      const reservas = occ?._count.id ?? 0;
      const taxa = Math.min(100, Math.round((nights / 90) * 100));
      return { name: prop.name, taxa, reservas, nights };
    });

    // ── Per-property revenue (for top properties) ──────────────────────────
    const propRevenueMap = new Map<string, number>();
    transactions.forEach((t) => {
      if (t.type === "INCOME") {
        // propertyId not in select — we need it
      }
    });

    // Fetch income per property separately
    const incomePerProp = propertyIds.length > 0
      ? await prisma.financialTransaction.groupBy({
          by: ["propertyId"],
          where: {
            propertyId: { in: propertyIds },
            type: "INCOME",
            createdAt: { gte: twelveMonthsAgo },
          },
          _sum: { amount: true },
        })
      : [];

    incomePerProp.forEach((r) => {
      if (r.propertyId) propRevenueMap.set(r.propertyId, r._sum.amount ?? 0);
    });

    // ── KPIs ───────────────────────────────────────────────────────────────
    const paidReservations = propertyIds.length > 0
      ? await prisma.reservation.findMany({
          where: {
            propertyId: { in: propertyIds },
            status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] },
            paymentStatus: "PAID",
          },
          select: { totalAmount: true },
        })
      : [];

    const ticketMedio =
      paidReservations.length > 0
        ? paidReservations.reduce((sum, r) => sum + r.totalAmount, 0) / paidReservations.length
        : 0;

    const receitaTotal = revenueByMonth.reduce((sum, m) => sum + m.receita, 0);
    const despesasTotal = revenueByMonth.reduce((sum, m) => sum + m.despesas, 0);
    const lucroLiquido = receitaTotal - despesasTotal;
    const totalNights = occupancyByProperty.reduce((sum, p) => sum + p.nights, 0);
    const maxNights = 90 * Math.max(properties.length, 1);
    const taxaOcupacaoMedia = Math.min(100, Math.round((totalNights / maxNights) * 100));

    const currentMonthReceita = revenueByMonth[revenueByMonth.length - 1]?.receita ?? 0;
    const lastMonthReceita = revenueByMonth[revenueByMonth.length - 2]?.receita ?? 0;
    const variacaoReceita =
      lastMonthReceita > 0
        ? Math.round(((currentMonthReceita - lastMonthReceita) / lastMonthReceita) * 1000) / 10
        : 0;

    const kpis = {
      ticketMedio: Math.round(ticketMedio),
      receitaTotal,
      despesasTotal,
      lucroLiquido,
      taxaOcupacaoMedia,
      totalReservas: paidReservations.length,
      variacaoReceita,
      variacaoOcupacao: 0,
    };

    // ── Top properties ─────────────────────────────────────────────────────
    const topProperties = properties
      .map((p) => ({
        name: p.name,
        receita: Math.round(propRevenueMap.get(p.id) ?? 0),
        reservas: occupancyByProperty.find((o) => o.name === p.name)?.reservas ?? 0,
      }))
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 5);

    return NextResponse.json({ revenueByMonth, occupancyByProperty, kpis, topProperties });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Erro ao carregar análises" }, { status: 500 });
  }
}
