import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { createGuestAccess } from "@/lib/guest-access";
import { calculateReservationQuote, parseReservationStay, PricingError, roundMoney } from "@/lib/pricing";
import { assertReservationAvailability, isReservationHoldExpired, lockReservationProperty, reservationMutationError } from "@/lib/reservation-availability";

const detailInclude = {
  property: { include: { owner: { select: { id: true, name: true } }, pricingRules: { where: { active: true } } } },
  cleaning: { include: { cleaner: true } }, transactions: true, guests: true,
} satisfies Prisma.ReservationInclude;
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || !["ADMIN", "TEAM", "OWNER"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const reservation = await prisma.reservation.findFirst({
    where: { id: params.id, ...(user.role === "OWNER" ? { property: { ownerId: user.id } } : {}) }, include: detailInclude,
  });
  if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
  return NextResponse.json({ reservation: { ...reservation, guestAccess: createGuestAccess(reservation) } }, { headers: responseHeaders });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || !["ADMIN", "TEAM"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const body = await req.json();
    const known = await prisma.reservation.findUnique({ where: { id: params.id }, select: { propertyId: true } });
    if (!known) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    const reservation = await prisma.$transaction(async tx => {
      await lockReservationProperty(tx, known.propertyId);
      const current = await tx.reservation.findUnique({ where: { id: params.id }, include: detailInclude });
      if (!current) throw new PricingError("Reserva não encontrada", 404);
      const data: Prisma.ReservationUpdateInput = {};
      for (const key of ["guestName", "guestEmail", "guestPhone", "notes", "source"] as const) {
        if (body[key] !== undefined) {
          if (typeof body[key] !== "string" || body[key].length > (key === "notes" ? 3000 : key === "guestEmail" ? 254 : 150) ||
              (key === "guestName" && !body[key].trim())) throw new PricingError("Dados cadastrais inválidos.", 400);
          data[key] = body[key].trim();
        }
      }
      const stay = parseReservationStay(body.checkIn ?? current.checkIn, body.checkOut ?? current.checkOut);
      const guestCount = body.guestCount === undefined ? current.guestCount : Number(body.guestCount);
      if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > current.property.maxGuests) throw new PricingError("Quantidade de hóspedes inválida.");
      const datesChanged = stay.checkIn.toISOString().slice(0, 10) !== current.checkIn.toISOString().slice(0, 10)
        || stay.checkOut.toISOString().slice(0, 10) !== current.checkOut.toISOString().slice(0, 10);
      const guestsChanged = guestCount !== current.guestCount;
      if (body.manualTotal !== undefined && (!["number", "string"].includes(typeof body.manualTotal) || !Number.isFinite(Number(body.manualTotal)) || Number(body.manualTotal) <= 0)) throw new PricingError("Total manual inválido.");
      const manualChanged = body.manualTotal !== undefined && roundMoney(Number(body.manualTotal)) !== roundMoney(current.totalAmount);
      const financialChange = datesChanged || guestsChanged || manualChanged;
      const paymentAttempt = financialChange ? await tx.setting.findFirst({ where: { key: { startsWith: `payment-attempt:${current.id}:` } }, select: { key: true } }) : null;
      if (financialChange && (!["PENDING", "FAILED"].includes(current.paymentStatus) || current.mpPaymentId || current.mpPreferenceId ||
          current.mpCheckoutUrl || current.installmentData || paymentAttempt || current.transactions.some(item => item.isPaid))) {
        throw new PricingError("Há cobrança ou pagamento registrado. Resolva a cobrança antes de alterar datas, hóspedes ou valores.", 409);
      }
      const targetStatus = body.status ?? current.status;
      if (body.status !== undefined && !["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED"].includes(body.status)) throw new PricingError("Status inválido.", 400);
      if (body.status !== undefined && current.status === "CANCELLED" && targetStatus !== "CANCELLED") throw new PricingError("Uma reserva cancelada não pode ser reativada. Crie uma nova reserva.", 409);
      if (targetStatus === "CHECKED_IN" && current.paymentStatus !== "PAID") throw new PricingError("Confirme o pagamento antes do check-in.", 409);
      if (body.status !== undefined && targetStatus !== "CANCELLED" && current.paymentStatus === "REVIEW") throw new PricingError("O pagamento aguarda conciliação.", 409);
      if ((financialChange || (body.status !== undefined && targetStatus !== "CANCELLED")) && isReservationHoldExpired(current)) throw new PricingError("A retenção desta reserva expirou. Crie uma nova reserva.", 409);
      if (targetStatus !== "CANCELLED" && (datesChanged || (body.status !== undefined && targetStatus !== current.status))) {
        await assertReservationAvailability(tx, { propertyId: current.propertyId, checkIn: stay.checkIn, checkOut: stay.checkOut, excludeReservationId: current.id });
      }
      if (financialChange) {
        const quote = calculateReservationQuote(current.property, stay.checkIn, stay.checkOut, guestCount, body.manualTotal);
        if (typeof body.expectedTotal !== "number" || !Number.isFinite(body.expectedTotal) || body.expectedTotal <= 0) throw new PricingError("Consulte a cotação antes de alterar os valores da reserva.", 400);
        if (roundMoney(body.expectedTotal) !== quote.totalAmount) throw Object.assign(new PricingError("O preço mudou. Revise a cotação atualizada antes de salvar.", 409), { quote });
        Object.assign(data, { totalAmount: quote.totalAmount, cleaningFee: quote.cleaningFee, commission: quote.commission, ownerAmount: quote.ownerAmount });
        if (datesChanged) Object.assign(data, { checkIn: stay.checkIn, checkOut: stay.checkOut, nights: quote.diarias });
        if (guestsChanged) data.guestCount = guestCount;
        await tx.financialTransaction.deleteMany({ where: { reservationId: current.id, isPaid: false, category: { in: ["RESERVATION_INCOME", "OWNER_REPASSE"] } } });
        await tx.financialTransaction.create({ data: {
          reservationId: current.id, propertyId: current.propertyId, type: "INCOME", category: "RESERVATION_INCOME",
          description: "Reserva " + current.code, amount: quote.totalAmount, createdById: user.id,
        } });
        await tx.financialTransaction.create({ data: {
          reservationId: current.id, propertyId: current.propertyId, type: "EXPENSE", category: "OWNER_REPASSE",
          description: "Repasse proprietário - " + current.property.name, amount: quote.ownerAmount,
          dueDate: new Date(stay.checkOut.getTime() + 72 * 3600000), createdById: user.id,
        } });
      }
      if (body.status !== undefined) data.status = targetStatus;
      if (datesChanged && current.cleaning) await tx.cleaning.update({ where: { id: current.cleaning.id }, data: {
        scheduledDate: stay.checkOut, checkoutTime: stay.checkOut, deadline: new Date(stay.checkOut.getTime() + 4 * 3600000),
      } });
      if (targetStatus === "CANCELLED") {
        await tx.cleaning.updateMany({ where: { reservationId: current.id, status: "PENDING" }, data: { status: "CANCELLED" } });
        await tx.financialTransaction.deleteMany({ where: { reservationId: current.id, isPaid: false } });
      } else if (body.status === "CHECKED_OUT" && current.cleaning) {
        await tx.cleaning.update({ where: { id: current.cleaning.id }, data: { status: "PENDING" } });
      }
      return tx.reservation.update({ where: { id: params.id }, data, include: detailInclude });
    }, { maxWait: 5000, timeout: 15000 });
    return NextResponse.json({ reservation: { ...reservation, guestAccess: createGuestAccess(reservation) } }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof PricingError && "quote" in error) return NextResponse.json({ error: error.message, code: "PRICE_CHANGED", quote: error.quote }, { status: 409 });
    const result = error instanceof PricingError ? { error: error.message, status: error.status }
      : error instanceof SyntaxError ? { error: "JSON inválido", status: 400 } : reservationMutationError(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
}

export async function DELETE(req: NextRequest, context: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  // Reuse the transactional cancellation and its related cleanup.
  const request = new NextRequest(req.url, { method: "PATCH", headers: req.headers, body: JSON.stringify({ status: "CANCELLED" }) });
  const result = await PATCH(request, context);
  if (!result.ok) return result;
  return NextResponse.json({ success: true });
}
