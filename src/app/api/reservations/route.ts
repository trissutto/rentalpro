import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { notifyNewReservation, notifyCleanerTask } from "@/lib/whatsapp";
import { calculateReservationQuote, parseReservationStay, parseReservationDate, PricingError, roundMoney } from "@/lib/pricing";
import { assertReservationAvailability, reservationMutationError } from "@/lib/reservation-availability";
import { createGuestAccess } from "@/lib/guest-access";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || !["ADMIN", "TEAM", "OWNER"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const query = new URL(req.url).searchParams;
    const page = Math.max(1, Math.floor(Number(query.get("page")) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(query.get("limit")) || 20)));
    const where = {
      ...(query.get("propertyId") ? { propertyId: query.get("propertyId")! } : {}),
      ...(query.get("status") ? { status: query.get("status")! } : {}),
      ...(user.role === "OWNER" ? { property: { ownerId: user.id } } : {}),
      ...(query.get("from") || query.get("to") ? { checkIn: {
        ...(query.get("from") ? { gte: parseReservationDate(query.get("from")) } : {}),
        ...(query.get("to") ? { lte: parseReservationDate(query.get("to")) } : {}),
      } } : {}),
    };
    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({ where, include: { property: { select: { id: true, name: true, city: true, address: true } }, cleaning: { select: { id: true, status: true } } },
        orderBy: { checkIn: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.reservation.count({ where }),
    ]);
    return NextResponse.json({ reservations, total, page, limit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PricingError ? error.message : "Erro ao carregar reservas" }, { status: error instanceof PricingError ? error.status : 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || !["ADMIN", "TEAM"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const body = await req.json();
    const { propertyId, guestName, guestEmail, guestPhone, guestCount = 1, source = "DIRECT", notes } = body;
    if (typeof propertyId !== "string" || !propertyId || typeof guestName !== "string" || !guestName.trim() || guestName.length > 150 ||
        (guestEmail != null && (typeof guestEmail !== "string" || guestEmail.length > 254)) ||
        (guestPhone != null && (typeof guestPhone !== "string" || guestPhone.length > 30)) ||
        typeof source !== "string" || source.length > 30 ||
        (notes != null && (typeof notes !== "string" || notes.length > 3000))) throw new PricingError("Dados da reserva inválidos.", 400);
    const stay = parseReservationStay(body.checkIn, body.checkOut);
    if (typeof body.expectedTotal !== "number" || !Number.isFinite(body.expectedTotal) || body.expectedTotal <= 0) throw new PricingError("Consulte a cotação antes de criar a reserva.", 400);
    const code = "R" + randomBytes(8).toString("hex").toUpperCase();
    const guestAccess = createGuestAccess({ code, checkOut: stay.checkOut });
    const result = await prisma.$transaction(async tx => {
      await assertReservationAvailability(tx, { propertyId, checkIn: stay.checkIn, checkOut: stay.checkOut });
      const property = await tx.property.findFirst({ where: { id: propertyId, active: true }, include: { pricingRules: { where: { active: true } } } });
      if (!property) throw new PricingError("Imóvel não encontrado", 404);
      // A staff-entered total is an explicit override; all derived amounts remain server-calculated.
      const quote = calculateReservationQuote(property, stay.checkIn, stay.checkOut, guestCount, body.manualTotal);
      if (roundMoney(body.expectedTotal) !== quote.totalAmount) return { priceChanged: true as const, quote };
      const reservation = await tx.reservation.create({ data: {
        code, propertyId, guestName: guestName.trim(), guestEmail: guestEmail || null, guestPhone: guestPhone || null,
        guestCount: quote.guestCount, checkIn: stay.checkIn, checkOut: stay.checkOut, nights: quote.diarias,
        totalAmount: quote.totalAmount, cleaningFee: quote.cleaningFee, commission: quote.commission, ownerAmount: quote.ownerAmount,
        status: "CONFIRMED", source, notes: notes || null, createdById: user.id,
      }, include: { property: true } });
      const cleaner = await tx.cleaner.findFirst({ where: { active: true, region: { contains: property.city } } });
      const deadline = new Date(stay.checkOut.getTime() + 4 * 3600000);
      const cleaning = await tx.cleaning.create({ data: {
        propertyId, reservationId: reservation.id, cleanerId: cleaner?.id, scheduledDate: stay.checkOut, checkoutTime: stay.checkOut, deadline, status: "PENDING",
      } });
      await tx.financialTransaction.create({ data: {
        reservationId: reservation.id, propertyId, type: "INCOME", category: "RESERVATION_INCOME",
        description: "Reserva " + code, amount: quote.totalAmount, createdById: user.id,
      } });
      await tx.financialTransaction.create({ data: {
        reservationId: reservation.id, propertyId, type: "EXPENSE", category: "OWNER_REPASSE",
        description: "Repasse proprietário - " + property.name, amount: quote.ownerAmount,
        dueDate: new Date(stay.checkOut.getTime() + 72 * 3600000), createdById: user.id,
      } });
      return { priceChanged: false as const, reservation, cleaning, cleaner, deadline };
    }, { maxWait: 5000, timeout: 15000 });
    if (result.priceChanged) return NextResponse.json({ error: "O preço mudou. Revise a cotação atualizada antes de confirmar.", code: "PRICE_CHANGED", quote: result.quote }, { status: 409 });
    // Notifications are outside the transaction; failures cannot turn a committed booking into a 500.
    await Promise.allSettled([
      notifyNewReservation({ guestName, guestPhone: guestPhone || "", propertyName: result.reservation.property.name,
        checkIn: stay.checkIn, checkOut: stay.checkOut, nights: stay.diarias, totalAmount: result.reservation.totalAmount }),
      ...(result.cleaner ? [notifyCleanerTask({ cleanerName: result.cleaner.name, cleanerPhone: result.cleaner.phone,
        propertyName: result.reservation.property.name, propertyAddress: result.reservation.property.address,
        scheduledDate: stay.checkOut, deadline: result.deadline, notes: notes || undefined })] : []),
    ]);
    return NextResponse.json({ reservation: { ...result.reservation, guestAccess }, cleaning: result.cleaning }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const result = error instanceof PricingError ? { error: error.message, status: error.status }
      : error instanceof SyntaxError ? { error: "JSON inválido", status: 400 } : reservationMutationError(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}
