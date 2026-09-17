import type { Prisma } from "@prisma/client";

export const RESERVATION_HOLD_MS = 2 * 60 * 60 * 1000;

export class ReservationAvailabilityError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); this.name = "ReservationAvailabilityError"; }
}

export function isReservationHoldExpired(reservation: { status: string; paymentStatus: string; createdAt: Date }, now = new Date()): boolean {
  return reservation.status === "PENDING" && ["PENDING", "FAILED"].includes(reservation.paymentStatus)
    && reservation.createdAt.getTime() <= now.getTime() - RESERVATION_HOLD_MS;
}

/** The same hold policy is used by the catalog, calendar and all reservation mutations. */
export function reservationOccupancyWhere(now = new Date()): Prisma.ReservationWhereInput {
  return { OR: [
    { status: { in: ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"] } },
    { status: "PENDING", OR: [
      { createdAt: { gt: new Date(now.getTime() - RESERVATION_HOLD_MS) } },
      { paymentStatus: { notIn: ["PENDING", "FAILED"] } },
    ] },
  ] };
}

/** Acquire SQLite's writer lock before the availability read (even when no holds expire). */
export async function lockReservationProperty(tx: Prisma.TransactionClient, propertyId: string) {
  const count = await tx.$executeRawUnsafe("UPDATE properties SET id = id WHERE id = ?", propertyId);
  if (!count) throw new ReservationAvailabilityError("Imóvel não encontrado", 404);
}

/** Raw legacy blocks contain ISO text; Prisma-written dates may contain epoch milliseconds. */
export async function getDateBlocks(
  tx: Pick<Prisma.TransactionClient, "$queryRawUnsafe">, propertyId: string, checkIn: Date, checkOut: Date,
): Promise<{ startDate: Date; endDate: Date }[]> {
  const rows = await tx.$queryRawUnsafe<{ startValue: string; endValue: string }[]>(
    "SELECT CAST(startDate AS TEXT) AS startValue, CAST(endDate AS TEXT) AS endValue FROM date_blocks WHERE propertyId = ?", propertyId,
  );
  const day = (value: string) => {
    if (typeof value !== "string" || !value.trim()) throw new ReservationAvailabilityError("Há um bloqueio de calendário inválido.", 503);
    const date = new Date(/^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value);
    if (!Number.isFinite(date.getTime())) throw new ReservationAvailabilityError("Há um bloqueio de calendário inválido. Verifique o calendário antes de reservar.", 503);
    return date.toISOString().slice(0, 10);
  };
  const from = checkIn.toISOString().slice(0, 10), to = checkOut.toISOString().slice(0, 10);
  return rows.map(row => {
    const start = day(row.startValue), end = day(row.endValue);
    if (start > end) throw new ReservationAvailabilityError("Há um bloqueio com datas invertidas.", 503);
    return { startDate: new Date(start + "T00:00:00.000Z"), endDate: new Date(end + "T23:59:59.999Z") };
  }).filter(block => block.startDate.toISOString().slice(0, 10) <= to && block.endDate.toISOString().slice(0, 10) >= from);
}

export async function assertReservationAvailability(tx: Prisma.TransactionClient, input: {
  propertyId: string; checkIn: Date; checkOut: Date; excludeReservationId?: string; now?: Date;
}): Promise<void> {
  const { propertyId, checkIn, checkOut, excludeReservationId, now = new Date() } = input;
  await lockReservationProperty(tx, propertyId);
  const expired = await tx.reservation.findMany({
    where: { propertyId, status: "PENDING", paymentStatus: { in: ["PENDING", "FAILED"] },
      createdAt: { lte: new Date(now.getTime() - RESERVATION_HOLD_MS) }, ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}) },
    select: { id: true },
  });
  if (expired.length) {
    const ids = expired.map(item => item.id);
    await tx.reservation.updateMany({ where: { id: { in: ids } }, data: { status: "CANCELLED" } });
    await tx.cleaning.updateMany({ where: { reservationId: { in: ids }, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.financialTransaction.deleteMany({ where: { reservationId: { in: ids }, isPaid: false } });
  }
  const from = new Date(checkIn.toISOString().slice(0, 10) + "T00:00:00.000Z");
  const to = new Date(checkOut.toISOString().slice(0, 10) + "T23:59:59.999Z");
  const conflict = await tx.reservation.findFirst({ where: {
    propertyId, ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    AND: [reservationOccupancyWhere(now), { checkIn: { lte: to } }, { checkOut: { gte: from } }],
  }, select: { id: true } });
  if (conflict || (await getDateBlocks(tx, propertyId, checkIn, checkOut)).length) {
    throw new ReservationAvailabilityError("Imóvel indisponível nessas datas");
  }
}

export function reservationMutationError(error: unknown): { error: string; status: number } {
  if (error instanceof ReservationAvailabilityError) return { error: error.message, status: error.status };
  const code = (error as { code?: string })?.code;
  if (["P1008", "P2034", "P2028"].includes(code ?? "")) return { error: "Outra operação está atualizando a reserva. Tente novamente.", status: 409 };
  return { error: "Não foi possível concluir a operação. Nenhuma alteração parcial foi salva.", status: 500 };
}
