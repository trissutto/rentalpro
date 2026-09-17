import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["ADMIN", "TEAM", "OWNER"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const rows = await prisma.reservation.findMany({
      where: { installmentData: { not: null }, ...(user.role === "OWNER" ? { property: { ownerId: user.id } } : {}) },
      select: { id: true, code: true, guestName: true, guestPhone: true, guestEmail: true, checkIn: true, checkOut: true,
        nights: true, totalAmount: true, paymentStatus: true, status: true, installmentData: true,
        property: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const plans = rows
      .map((r: any) => {
        let plan: any;
        try { plan = JSON.parse(r.installmentData); } catch { return null; }
        if (!plan?.items?.length) return null;

        const items = plan.items as any[];
        const paidItems = items.filter((i: any) => i.paid);
        const pendingItems = items.filter((i: any) => !i.paid);
        const overdueItems = pendingItems.filter((i: any) => {
          const d = new Date(i.dueDate.length === 10 ? i.dueDate + "T12:00:00" : i.dueDate);
          return d < today;
        });
        const dueSoonItems = pendingItems.filter((i: any) => {
          const d = new Date(i.dueDate.length === 10 ? i.dueDate + "T12:00:00" : i.dueDate);
          const diff = Math.floor((d.getTime() - today.getTime()) / 86400_000);
          return diff >= 0 && diff <= 5;
        });

        const paidAmount = paidItems.reduce((s: number, i: any) => s + Number(i.amount), 0);
        const pendingAmount = pendingItems.reduce((s: number, i: any) => s + Number(i.amount), 0);
        const overdueAmount = overdueItems.reduce((s: number, i: any) => s + Number(i.amount), 0);

        // Health: ok | due_soon | overdue
        const health = r.paymentStatus === "REVIEW" || r.status === "PAYMENT_REVIEW" ? "review" : overdueItems.length > 0 ? "overdue"
          : dueSoonItems.length > 0 ? "due_soon"
          : "ok";

        return {
          reservationId: r.id,
          code: r.code,
          guestName: r.guestName,
          guestPhone: r.guestPhone,
          guestEmail: r.guestEmail,
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          nights: r.nights,
          totalAmount: Number(r.totalAmount),
          reservationStatus: r.status,
          paymentStatus: r.paymentStatus,
          propertyName: r.property.name,
          propertyId: r.property.id,
          plan: {
            numInstallments: plan.numInstallments,
            entryAmount: Number(plan.entryAmount),
            installmentAmount: Number(plan.installmentAmount),
            deadline: plan.deadline,
            createdAt: plan.createdAt,
            items: items.map((i: any) => ({
              ...i,
              amount: Number(i.amount),
            })),
          },
          stats: {
            total: items.length,
            paid: paidItems.length,
            pending: pendingItems.length,
            overdue: overdueItems.length,
            dueSoon: dueSoonItems.length,
            paidAmount,
            pendingAmount,
            overdueAmount,
            health,
          },
        };
      })
      .filter(Boolean);

    // Totais gerais
    const summary = {
      totalPlans: plans.length,
      totalOverdue: plans.filter((p: any) => p.stats.health === "overdue").length,
      totalDueSoon: plans.filter((p: any) => p.stats.health === "due_soon").length,
      totalReview: plans.filter((p: any) => p.stats.health === "review").length,
      totalPaidAmount: plans.filter((p: any) => p.stats.health !== "review").reduce((s: number, p: any) => s + p.stats.paidAmount, 0),
      totalPendingAmount: plans.reduce((s: number, p: any) => s + p.stats.pendingAmount, 0),
      totalOverdueAmount: plans.reduce((s: number, p: any) => s + p.stats.overdueAmount, 0),
    };

    return NextResponse.json({ plans, summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("Installments API error:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
