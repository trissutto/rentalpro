import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { notifyNewReservation, notifyCleanerTask } from "@/lib/whatsapp";
import { addHours } from "date-fns";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");

  const where: Record<string, unknown> = {};
  if (propertyId) where.propertyId = propertyId;
  if (status) where.status = status;
  if (from || to) {
    where.checkIn = {};
    if (from) (where.checkIn as Record<string, unknown>).gte = new Date(from);
    if (to) (where.checkIn as Record<string, unknown>).lte = new Date(to);
  }

  if (user.role === "OWNER") {
    where.property = { ownerId: user.id };
  }

  const [reservations, total] = await Promise.all([
    prisma.reservation.findMany({
      where,
      include: {
        property: { select: { id: true, name: true, city: true, address: true } },
        cleaning: { select: { id: true, status: true } },
      },
      orderBy: { checkIn: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.reservation.count({ where }),
  ]);

  return NextResponse.json({ reservations, total, page, limit });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      propertyId, guestName, guestEmail, guestPhone, guestCount,
      checkIn, checkOut, totalAmount, cleaningFee, commission,
      ownerAmount, source, notes,
    } = body;

    if (!propertyId || !guestName || !checkIn || !checkOut || !totalAmount) {
      return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (nights <= 0) {
      return NextResponse.json({ error: "Check-out deve ser após check-in" }, { status: 400 });
    }

    // Check for conflicts
    const conflict = await prisma.reservation.findFirst({
      where: {
        propertyId,
        status: { notIn: ["CANCELLED"] },
        OR: [
          { checkIn: { lt: checkOutDate }, checkOut: { gt: checkInDate } },
        ],
      },
    });

    if (conflict) {
      return NextResponse.json({ error: "Conflito de datas com outra reserva" }, { status: 409 });
    }

    const code = `R${Date.now().toString(36).toUpperCase()}`;

    const reservation = await prisma.reservation.create({
      data: {
        code,
        propertyId,
        guestName,
        guestEmail,
        guestPhone,
        guestCount: Number(guestCount) || 1,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nights,
        totalAmount: Number(totalAmount),
        cleaningFee: Number(cleaningFee) || 0,
        commission: Number(commission) || 0,
        ownerAmount: Number(ownerAmount) || 0,
        source: source || "DIRECT",
        notes,
        createdById: user.id,
      },
      include: {
        property: true,
      },
    });

    // 🤖 AUTO: Create cleaning task
    const property = reservation.property;
    const cleaningDeadline = addHours(checkOutDate, 4);

    // Find available cleaner for the property region
    const cleaner = await prisma.cleaner.findFirst({
      where: { active: true, region: { contains: property.city, mode: "insensitive" } },
    });

    const cleaning = await prisma.cleaning.create({
      data: {
        propertyId,
        reservationId: reservation.id,
        cleanerId: cleaner?.id,
        scheduledDate: checkOutDate,
        checkoutTime: checkOutDate,
        deadline: cleaningDeadline,
        status: "PENDING",
      },
    });

    // 📲 WhatsApp notifications
    if (guestPhone) {
      await notifyNewReservation({
        guestName,
        guestPhone,
        propertyName: property.name,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nights,
        totalAmount: Number(totalAmount),
      });
    }

    if (cleaner) {
      await notifyCleanerTask({
        cleanerName: cleaner.name,
        cleanerPhone: cleaner.phone,
        propertyName: property.name,
        propertyAddress: property.address,
        scheduledDate: checkOutDate,
        deadline: cleaningDeadline,
        notes: notes || undefined,
      });
    }

    // 💰 Financial transactions
    await prisma.financialTransaction.createMany({
      data: [
        {
          reservationId: reservation.id,
          propertyId,
          type: "INCOME",
          category: "RESERVATION_INCOME",
          description: `Reserva ${code} - ${guestName}`,
          amount: Number(totalAmount),
          createdById: user.id,
        },
        {
          reservationId: reservation.id,
          propertyId,
          type: "EXPENSE",
          category: "OWNER_REPASSE",
          description: `Repasse proprietário - ${property.name}`,
          amount: Number(ownerAmount) || 0,
          dueDate: addHours(checkOutDate, 72),
          createdById: user.id,
        },
      ],
    });

    return NextResponse.json({ reservation, cleaning }, { status: 201 });
  } catch (error) {
    console.error("Error creating reservation:", error);
    return NextResponse.json({ error: "Erro ao criar reserva" }, { status: 500 });
  }
}
