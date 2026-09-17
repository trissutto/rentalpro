import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateReservationQuote, parseReservationStay, PricingError, roundMoney } from "@/lib/pricing";
import { assertReservationAvailability, reservationMutationError, RESERVATION_HOLD_MS } from "@/lib/reservation-availability";
import { createGuestAccess, PRIVATE_GUEST_HEADERS } from "@/lib/guest-access";
import { GET as getGuestReservation } from "./[code]/route";

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });
  return getGuestReservation(req, { params: { code } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { propertyId, guestName, guestEmail, guestPhone, notes, guestCount = 1, expectedTotal } = body;
    if (typeof propertyId !== "string" || !propertyId || typeof guestName !== "string" || !guestName.trim() || guestName.length > 150 ||
        typeof guestPhone !== "string" || !guestPhone.trim() || guestPhone.length > 30 ||
        (guestEmail != null && (typeof guestEmail !== "string" || guestEmail.length > 254)) ||
        (notes != null && (typeof notes !== "string" || notes.length > 3000))) {
      return NextResponse.json({ error: "Preencha os dados da reserva corretamente." }, { status: 400 });
    }
    if (typeof expectedTotal !== "number" || !Number.isFinite(expectedTotal) || expectedTotal <= 0) {
      return NextResponse.json({ error: "Atualize a cotação antes de reservar.", code: "QUOTE_REQUIRED" }, { status: 400 });
    }
    const stay = parseReservationStay(body.checkIn, body.checkOut, false);
    const code = "R" + randomBytes(8).toString("hex").toUpperCase();
    // Fail before persistence if the guest-link signing configuration is unavailable.
    const access = createGuestAccess({ code, checkOut: stay.checkOut });
    const result = await prisma.$transaction(async tx => {
      await assertReservationAvailability(tx, { propertyId, checkIn: stay.checkIn, checkOut: stay.checkOut });
      const property = await tx.property.findFirst({ where: { id: propertyId, active: true }, include: { pricingRules: { where: { active: true } } } });
      if (!property) throw new PricingError("Imóvel não encontrado", 404);
      const quote = calculateReservationQuote(property, stay.checkIn, stay.checkOut, guestCount);
      if (roundMoney(expectedTotal) !== quote.totalAmount) return { priceChanged: true as const, quote };
      const reservation = await tx.reservation.create({ data: {
        code, propertyId, guestName: guestName.trim(), guestEmail: guestEmail || null, guestPhone: guestPhone.trim(),
        guestCount: quote.guestCount, checkIn: stay.checkIn, checkOut: stay.checkOut, nights: quote.diarias,
        totalAmount: quote.totalAmount, cleaningFee: quote.cleaningFee, commission: quote.commission, ownerAmount: quote.ownerAmount,
        status: "PENDING", paymentStatus: "PENDING", source: "DIRECT", notes: notes || null,
      } });
      const cleaner = await tx.cleaner.findFirst({ where: { active: true, region: { contains: property.city } } });
      await tx.cleaning.create({ data: {
        propertyId, reservationId: reservation.id, cleanerId: cleaner?.id, scheduledDate: stay.checkOut,
        checkoutTime: stay.checkOut, deadline: new Date(stay.checkOut.getTime() + 4 * 3600000), status: "PENDING",
      } });
      await tx.financialTransaction.create({ data: {
        reservationId: reservation.id, propertyId, type: "INCOME", category: "RESERVATION_INCOME",
        description: "Reserva " + code, amount: quote.totalAmount,
      } });
      await tx.financialTransaction.create({ data: {
        reservationId: reservation.id, propertyId, type: "EXPENSE", category: "OWNER_REPASSE",
        description: "Repasse proprietário - " + property.name, amount: quote.ownerAmount,
        dueDate: new Date(stay.checkOut.getTime() + 72 * 3600000),
      } });
      return { priceChanged: false as const, reservation, quote };
    }, { maxWait: 5000, timeout: 15000 });
    if (result.priceChanged) return NextResponse.json({ error: "A cotação mudou. Confira o novo valor antes de confirmar.", code: "PRICE_CHANGED", quote: result.quote }, { status: 409 });
    const { reservation, quote } = result;
    return NextResponse.json({ reservation: {
      code: reservation.code, status: reservation.status, total: quote.totalAmount, totalAmount: quote.totalAmount,
      diarias: quote.diarias, nightCount: quote.nightCount,
      holdExpiresAt: new Date(reservation.createdAt.getTime() + RESERVATION_HOLD_MS).toISOString(), ...access,
    } }, { status: 201, headers: PRIVATE_GUEST_HEADERS });
  } catch (error) {
    const result = error instanceof PricingError ? { error: error.message, status: error.status } : error instanceof SyntaxError
      ? { error: "JSON inválido", status: 400 } : reservationMutationError(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
