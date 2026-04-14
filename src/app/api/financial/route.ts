import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") || "month";
  const propertyId = searchParams.get("propertyId");
  const type = searchParams.get("type");

  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  if (period === "month") {
    startDate = startOfMonth(now);
    endDate = endOfMonth(now);
  } else if (period === "year") {
    startDate = startOfYear(now);
    endDate = endOfYear(now);
  } else {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    startDate = from ? new Date(from) : startOfMonth(now);
    endDate = to ? new Date(to) : endOfMonth(now);
  }

  const where: Record<string, unknown> = {
    createdAt: { gte: startDate, lte: endDate },
  };
  if (propertyId) where.propertyId = propertyId;
  if (type) where.type = type;

  const [transactions, summary] = await Promise.all([
    prisma.financialTransaction.findMany({
      where,
      include: {
        reservation: { select: { code: true, guestName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.financialTransaction.groupBy({
      by: ["type", "category"],
      where,
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  // Calculate totals
  const income = transactions
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expenses = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const netProfit = income - expenses;

  // Monthly breakdown for charts (SQLite compatible — computed in JS)
  const yearTransactions = await prisma.financialTransaction.findMany({
    where: {
      createdAt: { gte: startOfYear(now), lte: endOfYear(now) },
    },
    select: { type: true, amount: true, createdAt: true },
  });

  const monthlyMap: Record<string, { month: string; income: number; expenses: number }> = {};
  for (const t of yearTransactions) {
    const key = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = { month: key, income: 0, expenses: 0 };
    if (t.type === "INCOME") monthlyMap[key].income += Number(t.amount);
    else monthlyMap[key].expenses += Number(t.amount);
  }
  const monthlyData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  return NextResponse.json({
    transactions,
    summary: { income, expenses, netProfit },
    monthlyData,
  });
}

function parseMoney(value: string | number): number {
  if (typeof value === "number") return value;
  return parseFloat(String(value).replace(/\./g, "").replace(",", ".")) || 0;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { reservationId, propertyId, type, category, description, amount, dueDate, isPaid, paidAt } = body;

    const transaction = await prisma.financialTransaction.create({
      data: {
        reservationId,
        propertyId,
        type,
        category,
        description,
        amount: parseMoney(amount),
        dueDate: dueDate ? new Date(dueDate) : undefined,
        isPaid: isPaid || false,
        paidAt: paidAt ? new Date(paidAt) : undefined,
        createdById: user.id,
      },
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao criar transação" }, { status: 500 });
  }
}
