import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeGuestRequest, checkInEligibility, PRIVATE_GUEST_HEADERS, validateGuestInput } from "@/lib/guest-access";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, guests, arrivalTime, observations } = body;
    if (typeof code !== "string" || !code.trim()) return NextResponse.json({ error: "Código obrigatório" }, { status: 400, headers: PRIVATE_GUEST_HEADERS });
    const denied = await authorizeGuestRequest(req, code, "checkin:write");
    if (denied) return denied;
    if ((arrivalTime != null && (typeof arrivalTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime)))
      || (observations != null && (typeof observations !== "string" || observations.length > 2000))) {
      return NextResponse.json({ error: "Horário ou observações inválidos" }, { status: 400, headers: PRIVATE_GUEST_HEADERS });
    }
    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { code: code.toUpperCase() },
        include: { property: { select: { name: true, accessInstructions: true, wifiName: true, wifiPassword: true, checkInTime: true, checkOutTime: true } } },
      });
      if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404, headers: PRIVATE_GUEST_HEADERS });
      const eligibility = checkInEligibility(reservation);
      if (!eligibility.allowed) return NextResponse.json({
        error: eligibility.reason, checkInEligibility: eligibility,
      }, { status: 403, headers: PRIVATE_GUEST_HEADERS });
      const guestData = guests === undefined ? undefined : validateGuestInput(guests, reservation.guestCount);
      if (guestData === null) return NextResponse.json({ error: "Dados dos hóspedes inválidos" }, { status: 400, headers: PRIVATE_GUEST_HEADERS });
      if (guestData) {
        await tx.guest.deleteMany({ where: { reservationId: reservation.id } });
        await tx.guest.createMany({ data: guestData.map((guest) => ({ ...guest, reservationId: reservation.id })) });
      }
      // Repeated submissions return the same access without duplicating completion notes.
      if (!reservation.checkInCompleted) {
        const note = `\n\nCHECK-IN ONLINE (${new Date().toISOString()}):\nChegada prevista: ${arrivalTime || "não informada"}\nObservações: ${observations || "nenhuma"}`;
        await tx.reservation.update({ where: { id: reservation.id }, data: {
          checkInCompleted: true, checkInCompletedAt: new Date(), status: "CHECKED_IN",
          notes: (reservation.notes || "") + note,
        } });
      }
      return NextResponse.json({ success: true, access: {
        instructions: reservation.property.accessInstructions,
        wifiName: reservation.property.wifiName, wifiPassword: reservation.property.wifiPassword,
        checkInTime: reservation.property.checkInTime,
      } }, { headers: PRIVATE_GUEST_HEADERS });
    });
  } catch (err) {
    console.error("Não foi possível registrar o check-in");
    return NextResponse.json({ error: err instanceof SyntaxError ? "Dados inválidos" : "Erro ao registrar check-in" }, { status: err instanceof SyntaxError ? 400 : 500, headers: PRIVATE_GUEST_HEADERS });
  }
}
