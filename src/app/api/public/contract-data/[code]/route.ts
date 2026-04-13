import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    // ── 1. Core reservation + property (only original schema fields) ──────────
    const reservation = await prisma.reservation.findUnique({
      where: { code: params.code.toUpperCase() },
      select: {
        id: true,
        code: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        guestCount: true,
        checkIn: true,
        checkOut: true,
        nights: true,
        totalAmount: true,
        cleaningFee: true,
        notes: true,
        createdAt: true,
        property: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            rules: true,
          },
        },
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    }

    // ── 2. Rooms + items (separate query — resilient to schema changes) ────────
    let checklist: {
      id: string; name: string; type: string;
      items: { name: string; icon: string; unit: string; quantity: number; notes?: string | null }[];
    }[] = [];
    try {
      const rooms = await prisma.room.findMany({
        where: { propertyId: reservation.property.id },
        include: {
          propertyItems: {
            include: { item: true },
          },
        },
      });
      checklist = rooms
        .filter((r) => r.active !== false && r.propertyItems.length > 0)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((room) => ({
          id: room.id,
          name: room.name,
          type: room.type,
          items: room.propertyItems.map((pi) => ({
            name: pi.item.name,
            icon: pi.item.icon,
            unit: pi.item.unit,
            quantity: pi.quantity,
            notes: pi.notes,
          })),
        }));
    } catch { /* rooms not yet in DB */ }

    // ── 3. Guests (separate query — new relation, may not exist yet) ──────────
    let guests: { name: string; birthDate: string | null; docType: string; docNumber: string }[] = [];
    try {
      const rawGuests = await prisma.guest.findMany({
        where: { reservationId: reservation.id },
        select: { name: true, birthDate: true, docType: true, docNumber: true },
      });
      guests = rawGuests.map((g) => ({
        name: g.name,
        birthDate: g.birthDate?.toISOString() ?? null,
        docType: g.docType,
        docNumber: g.docNumber,
      }));
    } catch { /* guests table not yet created */ }

    // ── 4. New property fields (raw SQL fallback) ─────────────────────────────
    let checkInTime = "14:00";
    let checkOutTime = "12:00";
    try {
      const raw = await prisma.$queryRaw<{ checkInTime: string | null; checkOutTime: string | null }[]>`
        SELECT "checkInTime", "checkOutTime" FROM "properties" WHERE "id" = ${reservation.property.id} LIMIT 1
      `;
      if (raw?.[0]?.checkInTime) checkInTime = raw[0].checkInTime;
      if (raw?.[0]?.checkOutTime) checkOutTime = raw[0].checkOutTime;
    } catch { /* new columns not yet in DB */ }

    return NextResponse.json({
      reservation: {
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
        notes: reservation.notes,
        createdAt: reservation.createdAt,
      },
      property: {
        name: reservation.property.name,
        address: reservation.property.address,
        city: reservation.property.city,
        state: reservation.property.state,
        rules: reservation.property.rules,
        checkInTime,
        checkOutTime,
      },
      guests,
      checklist,
    });
  } catch (err) {
    console.error("contract-data error:", err);
    const msg = err instanceof Error ? err.message : "Erro ao carregar contrato";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
