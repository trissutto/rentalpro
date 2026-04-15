import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    include: {
      property: { include: { owner: { select: { id: true, name: true } } } },
      cleaning: { include: { cleaner: true } },
      transactions: true,
      guests: true,
    },
  });

  if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });

  return NextResponse.json({ reservation });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      status,
      notes,
      guestName,
      guestEmail,
      guestPhone,
      guestCount,
      source,
      checkIn,
      checkOut,
      manualTotal, // optional override for total
      ...rest
    } = body;

    const updateData: Record<string, unknown> = {};

    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (guestName !== undefined) updateData.guestName = guestName;
    if (guestEmail !== undefined) updateData.guestEmail = guestEmail;
    if (guestPhone !== undefined) updateData.guestPhone = guestPhone;
    if (guestCount !== undefined) updateData.guestCount = parseInt(guestCount);
    if (source !== undefined) updateData.source = source;

    // Recalculate if dates or guest count changed
    const needsRecalc = checkIn !== undefined || checkOut !== undefined || guestCount !== undefined;
    if (needsRecalc && manualTotal === undefined) {
      const current = await prisma.reservation.findUnique({
        where: { id: params.id },
        select: {
          checkIn: true,
          checkOut: true,
          guestCount: true,
          property: {
            select: {
              basePrice: true,
              cleaningFee: true,
              commissionRate: true,
              idealGuests: true,
              extraGuestFee: true,
            },
          },
        },
      });

      if (!current) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });

      const newCheckIn  = checkIn  ? new Date(checkIn)  : current.checkIn;
      const newCheckOut = checkOut ? new Date(checkOut) : current.checkOut;
      const newGuestCount = guestCount !== undefined ? parseInt(guestCount) : current.guestCount;

      const msPerDay = 1000 * 60 * 60 * 24;
      const nights = Math.max(1, Math.round((newCheckOut.getTime() - newCheckIn.getTime()) / msPerDay)) + 1;

      const { basePrice, cleaningFee, commissionRate } = current.property;
      // Extra guest fee (use try/catch for backward compat before db push)
      let extraGuestAmount = 0;
      try {
        const idealGuests = (current.property as Record<string, unknown>).idealGuests as number ?? 2;
        const extraGuestFee = (current.property as Record<string, unknown>).extraGuestFee as number ?? 0;
        const extraGuests = Math.max(0, newGuestCount - idealGuests);
        extraGuestAmount = extraGuests * extraGuestFee * nights;
      } catch { /* field not yet in db */ }

      const base = basePrice * nights;
      const totalAmount = base + extraGuestAmount;
      const commission    = Math.round((totalAmount * commissionRate) / 100 * 100) / 100;
      const ownerAmount   = totalAmount + cleaningFee - commission;

      if (checkIn !== undefined) updateData.checkIn = newCheckIn;
      if (checkOut !== undefined) updateData.checkOut = newCheckOut;
      if (checkIn !== undefined || checkOut !== undefined) updateData.nights = nights;
      updateData.totalAmount  = totalAmount;
      updateData.cleaningFee  = cleaningFee;
      updateData.commission   = commission;
      updateData.ownerAmount  = ownerAmount;
    } else if (manualTotal !== undefined) {
      // Manual override — still need dates for nights calculation
      const current = await prisma.reservation.findUnique({
        where: { id: params.id },
        select: {
          checkIn: true,
          checkOut: true,
          property: { select: { cleaningFee: true, commissionRate: true } },
        },
      });
      if (current) {
        const newCheckIn  = checkIn  ? new Date(checkIn)  : current.checkIn;
        const newCheckOut = checkOut ? new Date(checkOut) : current.checkOut;
        const msPerDay = 1000 * 60 * 60 * 24;
        const nights = Math.max(1, Math.round((newCheckOut.getTime() - newCheckIn.getTime()) / msPerDay)) + 1;
        const totalAmount = Number(manualTotal);
        const { cleaningFee, commissionRate } = current.property;
        const commission = Math.round((totalAmount * commissionRate) / 100 * 100) / 100;
        const ownerAmount = totalAmount + cleaningFee - commission;
        if (checkIn !== undefined) updateData.checkIn = newCheckIn;
        if (checkOut !== undefined) updateData.checkOut = newCheckOut;
        if (checkIn !== undefined || checkOut !== undefined) updateData.nights = nights;
        updateData.totalAmount = totalAmount;
        updateData.cleaningFee = cleaningFee;
        updateData.commission = commission;
        updateData.ownerAmount = ownerAmount;
      }
    }

    const reservation = await prisma.reservation.update({
      where: { id: params.id },
      data: updateData,
      include: {
        property: { include: { owner: { select: { id: true, name: true } } } },
        cleaning: { include: { cleaner: true } },
        transactions: true,
        guests: true,
      },
    });

    // Auto-update cleaning when checkout
    if (status === "CHECKED_OUT" && reservation.cleaning) {
      await prisma.cleaning.update({
        where: { id: reservation.cleaning.id },
        data: { status: "PENDING" },
      });
    }

    return NextResponse.json({ reservation });
  } catch (err) {
    console.error("Reservation PATCH error:", err);
    return NextResponse.json({ error: "Erro ao atualizar reserva" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.reservation.update({
    where: { id: params.id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ success: true });
}
