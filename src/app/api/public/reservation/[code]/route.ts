import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const reservation = await prisma.reservation.findUnique({
    where: { code: params.code.toUpperCase() },
    include: {
      property: {
        select: {
          name: true, address: true, city: true, state: true,
          capacity: true, bedrooms: true, bathrooms: true,
        },
      },
      guests: true,
    },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
  }

  // Load installmentData via raw SQL (column added via migration)
  let installmentPlan = null;
  try {
    const rows: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT installmentData FROM reservations WHERE code = ?`,
      params.code.toUpperCase()
    );
    if (rows[0]?.installmentData) {
      installmentPlan = JSON.parse(rows[0].installmentData);
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    reservation: {
      id: reservation.id,
      code: reservation.code,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail,
      guestPhone: reservation.guestPhone,
      guestCount: reservation.guestCount,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      nights: reservation.nights,
      totalAmount: reservation.totalAmount,
      cleaningFee: reservation.cleaningFee,
      status: reservation.status,
      paymentStatus: reservation.paymentStatus,
      paymentMethod: reservation.paymentMethod,
      mpCheckoutUrl: reservation.mpCheckoutUrl,
      paidAt: reservation.paidAt,
      notes: reservation.notes,
      property: reservation.property,
      guests: reservation.guests,
      installmentPlan,
    },
  });
}
