import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { id } = params;
    const body = await req.json();
    const { description, amount, isPaid, paidAt } = body;

    // Get the expense to verify ownership
    const expense = await prisma.financialTransaction.findUnique({
      where: { id },
      include: { property: { select: { ownerId: true } } },
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Despesa não encontrada" },
        { status: 404 }
      );
    }

    // Verify ownership if user is OWNER
    if (user.role === "OWNER" && expense.property?.ownerId !== user.id) {
      return NextResponse.json(
        { error: "Acesso negado" },
        { status: 403 }
      );
    }

    const updated = await prisma.financialTransaction.update({
      where: { id },
      data: {
        ...(description && { description }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(typeof isPaid === "boolean" && { isPaid }),
        ...(paidAt && { paidAt: new Date(paidAt) }),
      },
      include: {
        property: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({
      id: updated.id,
      propertyId: updated.propertyId,
      propertyName: updated.property?.name,
      category: updated.category,
      description: updated.description,
      amount: updated.amount,
      isPaid: updated.isPaid,
      paidAt: updated.paidAt,
      createdAt: updated.createdAt,
    });
  } catch (error) {
    console.error("Expenses PUT error:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar despesa" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { id } = params;

    // Get the expense to verify ownership
    const expense = await prisma.financialTransaction.findUnique({
      where: { id },
      include: { property: { select: { ownerId: true } } },
    });

    if (!expense) {
      return NextResponse.json(
        { error: "Despesa não encontrada" },
        { status: 404 }
      );
    }

    // Verify ownership if user is OWNER
    if (user.role === "OWNER" && expense.property?.ownerId !== user.id) {
      return NextResponse.json(
        { error: "Acesso negado" },
        { status: 403 }
      );
    }

    await prisma.financialTransaction.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Expenses DELETE error:", error);
    return NextResponse.json(
      { error: "Erro ao deletar despesa" },
      { status: 500 }
    );
  }
}
