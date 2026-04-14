import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const propertyFilter = user.role === "OWNER" ? { property: { ownerId: user.id } } : {};

  const [
    totalProperties,
    todayCheckins,
    todayCheckouts,
    pendingCleanings,
    lateCleanings,
    activeReservations,
    monthlyIncome,
    monthlyExpenses,
    occupancyData,
    recentReservations,
    upcomingCleanings,
  ] = await Promise.all([
    prisma.property.count({ where: { active: true, ...(user.role === "OWNER" ? { ownerId: user.id } : {}) } }),

    prisma.reservation.count({
      where: { ...propertyFilter, checkIn: { gte: todayStart, lte: todayEnd }, status: { notIn: ["CANCELLED"] } },
    }),

    prisma.reservation.count({
      where: { ...propertyFilter, checkOut: { gte: todayStart, lte: todayEnd }, status: { notIn: ["CANCELLED"] } },
    }),

    prisma.cleaning.count({ where: { status: "PENDING", ...propertyFilter } }),

    prisma.cleaning.count({ where: { status: "LATE", ...propertyFilter } }),

    prisma.reservation.count({
      where: { ...propertyFilter, status: { in: ["CONFIRMED", "CHECKED_IN"] } },
    }),

    prisma.financialTransaction.aggregate({
      where: { type: "INCOME", createdAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),

    prisma.financialTransaction.aggregate({
      where: { type: "EXPENSE", createdAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),

    // Occupancy: properties with active reservations today
    prisma.reservation.count({
      where: {
        ...propertyFilter,
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
        checkIn: { lte: today },
        checkOut: { gte: today },
      },
    }),

    prisma.reservation.findMany({
      where: { ...propertyFilter, status: { notIn: ["CANCELLED"] } },
      include: { property: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    prisma.cleaning.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS", "LATE"] }, ...propertyFilter },
      include: {
        property: { select: { id: true, name: true } },
        cleaner: { select: { id: true, name: true } },
      },
      orderBy: { scheduledDate: "asc" },
      take: 5,
    }),
  ]);

  const totalProps = totalProperties || 1;
  const occupancyRate = Math.round((occupancyData / totalProps) * 100);
  const income = Number(monthlyIncome._sum.amount || 0);
  const expenses = Number(monthlyExpenses._sum.amount || 0);

  return NextResponse.json({
    stats: {
      totalProperties,
      todayCheckins,
      todayCheckouts,
      pendingCleanings,
      lateCleanings,
      activeReservations,
      occupancyRate,
      monthlyIncome: income,
      monthlyExpenses: expenses,
      monthlyProfit: income - expenses,
    },
    recentReservations,
    upcomingCleanings,
  });
}
