import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  const reservation = await prisma.reservation.findUnique({
    where: { code: params.code },
    include: { guests: true },
  });
  if (!reservation) {
    return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ guests: reservation.guests, guestCount: reservation.guestCount });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const reservation = await prisma.reservation.findUnique({
    where: { code: params.code },
  });
  if (!reservation) {
    return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const { guests } = body as {
    guests: { name: string; birthDate: string; docType: string; docNumber: string }[];
  };

  if (!Array.isArray(guests) || guests.length === 0) {
    return NextResponse.json({ error: "Informe os dados dos hóspedes" }, { status: 400 });
  }

  // Apaga hóspedes antigos e recria
  await prisma.guest.deleteMany({ where: { reservationId: reservation.id } });

  const created = await prisma.guest.createMany({
    data: guests.map((g) => ({
      reservationId: reservation.id,
      name: g.name,
      birthDate: new Date(g.birthDate),
      docType: g.docType || "CPF",
      docNumber: g.docNumber,
    })),
  });

  return NextResponse.json({ success: true, count: created.count });
}
