import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeGuestRequest, PRIVATE_GUEST_HEADERS, validateGuestInput } from "@/lib/guest-access";

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const denied = await authorizeGuestRequest(req, params.code);
  if (denied) return denied;
  const reservation = await prisma.reservation.findUnique({
    where: { code: params.code.toUpperCase() },
    select: { guestCount: true, guests: { select: { name: true, birthDate: true, docType: true, docNumber: true } } },
  });
  if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404, headers: PRIVATE_GUEST_HEADERS });
  return NextResponse.json(reservation, { headers: PRIVATE_GUEST_HEADERS });
}

export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const denied = await authorizeGuestRequest(req, params.code, "guests:write");
  if (denied) return denied;
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400, headers: PRIVATE_GUEST_HEADERS });
  }
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({ where: { code: params.code.toUpperCase() } });
    if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404, headers: PRIVATE_GUEST_HEADERS });
    if (!["PENDING", "CONFIRMED", "CHECKED_IN"].includes(reservation.status)) {
      return NextResponse.json({ error: "Esta reserva não permite alterar hóspedes" }, { status: 409, headers: PRIVATE_GUEST_HEADERS });
    }
    const guests = validateGuestInput(body?.guests, reservation.guestCount);
    if (!guests) return NextResponse.json({ error: "Informe hóspedes válidos, dentro da quantidade reservada, com nome, nascimento e documento" }, { status: 400, headers: PRIVATE_GUEST_HEADERS });
    await tx.guest.deleteMany({ where: { reservationId: reservation.id } });
    const created = await tx.guest.createMany({ data: guests.map((guest) => ({ ...guest, reservationId: reservation.id })) });
    return NextResponse.json({ success: true, count: created.count }, { headers: PRIVATE_GUEST_HEADERS });
  });
}
