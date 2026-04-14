import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const FIXED_CATEGORIES = ["AGUA", "LUZ", "IPTU", "INTERNET", "JARDIM", "PISCINA"];
export const VARIABLE_CATEGORIES = ["MAINTENANCE", "SUPPLIES", "CLEANING_COST", "INSURANCE", "OTHER"];
export const ALL_CATEGORIES = [...FIXED_CATEGORIES, ...VARIABLE_CATEGORIES];

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get("propertyId");
    const month = searchParams.get("month"); // YYYY-MM format
    const expenseType = searchParams.get("expenseType"); // "fixed" | "variable"

    const whereClause: any = { type: "EXPENSE" };

    if (user.role === "OWNER") {
      whereClause.property = { ownerId: user.id };
    }

    if (propertyId) whereClause.propertyId = propertyId;

    if (expenseType === "fixed") {
      whereClause.category = { in: FIXED_CATEGORIES };
    } else if (expenseType === "variable") {
      whereClause.category = { in: VARIABLE_CATEGORIES };
    }

    if (month) {
      const [year, monthNum] = month.split("-");
      const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59);
      whereClause.createdAt = { gte: startDate, lte: endDate };
    }

    const expenses = await prisma.financialTransaction.findMany({
      where: whereClause,
      include: {
        property: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const formatted = expenses.map((e) => ({
      id: e.id,
      propertyId: e.propertyId,
      propertyName: (e as any).property?.name || "N/A",
      category: e.category,
      description: e.description,
      amount: e.amount,
      isPaid: e.isPaid,
      paidAt: e.paidAt,
      createdAt: e.createdAt,
    }));

    return NextResponse.json({ expenses: formatted });
  } catch (error) {
    console.error("Expenses GET error:", error);
    return NextResponse.json({ error: "Erro ao carregar despesas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Bulk save fixed expenses for a property/month
    if (body.bulkFixed) {
      const { propertyId, month, items } = body;
      // items: [{ category, amount, isPaid, paidAt }]

      if (!propertyId || !month || !Array.isArray(items)) {
        return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
      }

      const [year, monthNum] = month.split("-");
      const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59);

      // Delete existing fixed expenses for this property/month
      await prisma.financialTransaction.deleteMany({
        where: {
          propertyId,
          type: "EXPENSE",
          category: { in: FIXED_CATEGORIES },
          createdAt: { gte: startDate, lte: endDate },
        },
      });

      // Re-create all provided items
      const created = await prisma.$transaction(
        items.map((item: any) =>
          prisma.financialTransaction.create({
            data: {
              propertyId,
              type: "EXPENSE",
              category: item.category,
              description: item.description || item.category,
              amount: parseFloat(item.amount) || 0,
              isPaid: item.isPaid || false,
              paidAt: item.paidAt ? new Date(item.paidAt) : null,
              createdById: user.id,
              createdAt: startDate,
            },
          })
        )
      );

      return NextResponse.json({ saved: created.length });
    }

    // Single expense creation
    const { propertyId, category, description, amount, paidAt, isPaid } = body;

    if (!propertyId || !category || !description || !amount) {
      return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
    }

    if (!ALL_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
    }

    if (user.role === "OWNER") {
      const prop = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { ownerId: true },
      });
      if (prop?.ownerId !== user.id) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }
    }

    const expense = await prisma.financialTransaction.create({
      data: {
        propertyId,
        type: "EXPENSE",
        category,
        description,
        amount: parseFloat(amount),
        isPaid: isPaid || false,
        paidAt: paidAt ? new Date(paidAt) : null,
        createdById: user.id,
      },
      include: {
        property: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      id: expense.id,
      propertyId: expense.propertyId,
      propertyName: (expense as any).property?.name,
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      isPaid: expense.isPaid,
      paidAt: expense.paidAt,
      createdAt: expense.createdAt,
    });
  } catch (error) {
    console.error("Expenses POST error:", error);
    return NextResponse.json({ error: "Erro ao criar despesa" }, { status: 500 });
  }
}
