import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { notifyCleaningLate } from "@/lib/whatsapp";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const propertyId = searchParams.get("propertyId");
  const cleanerId = searchParams.get("cleanerId");
  const date = searchParams.get("date");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (propertyId) where.propertyId = propertyId;
  if (cleanerId) where.cleanerId = cleanerId;
  if (date) {
    const d = new Date(date);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    where.scheduledDate = { gte: d, lt: nextDay };
  }

  // Auto-mark as LATE only tasks still PENDING with deadline passed.
  // IN_PROGRESS and DONE are intentionally excluded — once a cleaner
  // has started or finished, the status must NOT be reverted automatically.
  await prisma.cleaning.updateMany({
    where: {
      status: "PENDING",
      deadline: { lt: new Date() },
    },
    data: { status: "LATE" },
  });

  const cleanings = await prisma.cleaning.findMany({
    where,
    include: {
      property: { select: { id: true, name: true, address: true, city: true } },
      cleaner: { select: { id: true, name: true, phone: true } },
      reservation: { select: { id: true, guestName: true, checkOut: true, notes: true } },
    },
    orderBy: [{ status: "asc" }, { scheduledDate: "asc" }],
  });

  return NextResponse.json({ cleanings });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { propertyId, cleanerId, scheduledDate, deadline, notes } = body;

    const cleaning = await prisma.cleaning.create({
      data: {
        propertyId,
        cleanerId,
        scheduledDate: new Date(scheduledDate),
        deadline: deadline ? new Date(deadline) : undefined,
        notes,
        status: "PENDING",
      },
      include: {
        property: true,
        cleaner: true,
      },
    });

    return NextResponse.json({ cleaning }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao criar limpeza" }, { status: 500 });
  }
}
