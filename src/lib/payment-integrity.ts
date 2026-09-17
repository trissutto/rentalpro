import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { limparToken } from "./pagbank";
import { assertReservationAvailability, isReservationHoldExpired, ReservationAvailabilityError } from "./reservation-availability";

export type Gateway = "pagbank" | "pagarme" | "mercadopago";
export type PaymentState = "PAID" | "PENDING" | "FAILED" | "REVIEW";
export interface VerifiedPayment {
  gateway: Gateway; id: string; parentId?: string; reference: string;
  amountCents: number; currency: string; state: PaymentState; method: string;
}
export class PaymentError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export interface PaymentAttempt {
  key: string; gateway: Gateway; kind: string; amountCents: number;
  state: PaymentState | "CREATING"; createdAt: string; gatewayId?: string;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const attemptKey = (id: string, seq?: number) => `payment-attempt:${id}:${seq ?? "full"}`;
export const cents = (value: number) => Math.round(value * 100);

// A write before the read serializes reservation transitions in SQLite. All
// writers must use the same DB transaction; no network call is made in it.
export async function lockPayments(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`UPDATE reservations SET id = id WHERE id = '__payment_lock__'`;
}

export async function beginPaymentAttempt(id: string, gateway: Gateway, kind: string, seq?: number): Promise<PaymentAttempt> {
  return prisma.$transaction(async tx => {
    await lockPayments(tx);
    const r = await tx.reservation.findUniqueOrThrow({ where: { id } });
    if (!["PENDING", "CONFIRMED"].includes(r.status) || ["PAID", "REVIEW"].includes(r.paymentStatus) || isReservationHoldExpired(r)) {
      throw new PaymentError("Reserva indisponível para pagamento. Entre em contato com a administração.");
    }
    await assertReservationAvailability(tx, { propertyId: r.propertyId, checkIn: r.checkIn, checkOut: r.checkOut, excludeReservationId: r.id });
    const plan = r.installmentData ? JSON.parse(r.installmentData) : null;
    const item = seq ? plan?.items?.find((i: { seq: number }) => i.seq === seq) : null;
    if (seq && (!item || item.paid)) throw new PaymentError("Parcela indisponível para pagamento.");
    if (!seq && plan) throw new PaymentError("Use o plano de parcelas existente.");
    if (seq && await tx.setting.findUnique({ where: { key: attemptKey(id) } })) throw new PaymentError("Já existe uma tentativa de pagamento integral.");
    const amountCents = cents(Number(seq ? item.amount : r.totalAmount));
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new PaymentError("Valor inválido.");
    const key = attemptKey(id, seq);
    const saved = await tx.setting.findUnique({ where: { key } });
    if (!saved && (seq ? item.mpPaymentId : r.mpPaymentId || r.mpPreferenceId)) {
      throw new PaymentError("Já existe uma cobrança anterior. Aguarde a confirmação ou solicite conferência à administração.");
    }
    if (saved) {
      const previous: PaymentAttempt = JSON.parse(saved.value);
      if (previous.state !== "FAILED") {
        if (previous.gateway !== gateway || previous.kind !== kind || previous.amountCents !== amountCents || Date.now() - Date.parse(previous.createdAt) > 23 * 3600000) {
          throw new PaymentError("Já existe uma tentativa em andamento. Aguarde a confirmação ou solicite atendimento.");
        }
        return previous;
      }
    }
    const attempt: PaymentAttempt = { key: randomUUID(), gateway, kind, amountCents, state: "CREATING", createdAt: new Date().toISOString() };
    await tx.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(attempt) }, update: { value: JSON.stringify(attempt) } });
    return attempt;
  });
}

export async function savePaymentAttempt(id: string, attempt: PaymentAttempt, gatewayId: string, seq?: number) {
  if (typeof gatewayId !== "string" || !gatewayId) throw new PaymentError("Resposta inválida do gateway.", 502);
  await prisma.$transaction(async tx => {
    await lockPayments(tx);
    const key = attemptKey(id, seq);
    const current = await tx.setting.findUnique({ where: { key } });
    if (!current) throw new PaymentError("Tentativa não encontrada.", 503);
    const saved: PaymentAttempt = JSON.parse(current.value);
    if (saved.key !== attempt.key) throw new PaymentError("Tentativa substituída.");
    saved.gatewayId = gatewayId;
    if (saved.state === "CREATING") saved.state = "PENDING";
    await tx.setting.update({ where: { key }, data: { value: JSON.stringify(saved) } });
    const bindingKey = `payment-binding:${attempt.gateway}:${gatewayId}`;
    await tx.setting.upsert({ where: { key: bindingKey }, create: { key: bindingKey, value: JSON.stringify({ reservationId: id, seq: seq ?? null }) }, update: {} });
    if (!seq) await tx.reservation.update({ where: { id }, data: { mpPaymentId: gatewayId } });
    else {
      const r = await tx.reservation.findUniqueOrThrow({ where: { id } });
      const plan = JSON.parse(r.installmentData!);
      const item = plan.items.find((i: { seq: number }) => i.seq === seq);
      if (item) { item.mpPaymentId = gatewayId; await tx.reservation.update({ where: { id }, data: { installmentData: JSON.stringify(plan) } }); }
    }
  });
}

export async function gatewayJson(url: string, authorization: string) {
  const response = await fetch(url, { headers: { Authorization: authorization }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new PaymentError("Não foi possível verificar o pagamento no gateway.", 502);
  return response.json();
}

// Webhook bodies only select a resource. No status, amount or reference from
// the unauthenticated notification is ever used to settle a reservation.
export async function fetchVerifiedPayments(gateway: Gateway, id: string): Promise<VerifiedPayment[]> {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new PaymentError("Identificador inválido.", 400);
  const settingKey = { pagbank: "pagbank_token", pagarme: "pagarme_api_key", mercadopago: "mp_access_token" }[gateway];
  const setting = await prisma.setting.findUnique({ where: { key: settingKey } });
  if (!setting?.value) throw new PaymentError("Gateway não configurado.", 503);
  if (gateway === "pagbank") {
    if (!/^(ORDE|CHAR)_/.test(id)) throw new PaymentError("Identificador PagBank inválido.", 400);
    const order = id.startsWith("ORDE_");
    const data = await gatewayJson(`https://api.pagseguro.com/${order ? "orders" : "charges"}/${encodeURIComponent(id)}`, `Bearer ${limparToken(setting.value)}`);
    if (data.id !== id) throw new PaymentError("Identificador divergente no gateway.", 422);
    return (order ? data.charges ?? [] : [data]).map((charge: any) => ({
      gateway, id: String(charge.id), parentId: order ? id : undefined,
      reference: order ? data.reference_id : charge.reference_id,
      amountCents: charge.status === "PAID" ? charge.amount?.summary?.paid ?? charge.amount?.value : charge.amount?.value, currency: charge.amount?.currency,
      state: charge.status === "PAID" && !(charge.amount?.summary?.refunded > 0) ? "PAID" :
        ["DECLINED", "CANCELED"].includes(charge.status) ? "FAILED" :
        ["REFUNDED", "IN_DISPUTE"].includes(charge.status) || charge.amount?.summary?.refunded > 0 ? "REVIEW" : "PENDING",
      method: charge.payment_method?.type === "CREDIT_CARD" ? `Cartão de Crédito (${charge.payment_method.installments || 1}x)` : "PIX",
    }));
  }
  if (gateway === "pagarme") {
    if (!id.startsWith("or_")) throw new PaymentError("Pedido Pagar.me inválido.", 400);
    const data = await gatewayJson(`https://api.pagar.me/core/v5/orders/${encodeURIComponent(id)}`, `Basic ${Buffer.from(`${setting.value.trim()}:`).toString("base64")}`);
    if (data.id !== id) throw new PaymentError("Identificador divergente no gateway.", 422);
    const paidCharges = (data.charges ?? []).filter((charge: any) => charge.status === "paid");
    const refunded = (data.charges ?? []).some((charge: any) => ["refunded", "chargedback"].includes(charge.status));
    return [{ gateway, id, reference: data.code, amountCents: data.amount, currency: data.currency,
      state: refunded ? "REVIEW" : data.status === "paid" && paidCharges.reduce((sum: number, charge: any) => sum + Number(charge.paid_amount ?? charge.amount ?? 0), 0) === data.amount ? "PAID" : ["failed", "canceled"].includes(data.status) ? "FAILED" : "PENDING",
      method: "Cartão de Crédito" }];
  }
  if (!/^\d+$/.test(id)) throw new PaymentError("Pagamento Mercado Pago inválido.", 400);
  const data = await gatewayJson(`https://api.mercadopago.com/v1/payments/${id}`, `Bearer ${setting.value.trim()}`);
  if (String(data.id) !== id) throw new PaymentError("Identificador divergente no gateway.", 422);
  return [{ gateway, id, reference: data.external_reference, amountCents: cents(Number(data.transaction_amount)), currency: data.currency_id,
    state: data.status === "approved" && !data.transaction_amount_refunded ? "PAID" : ["rejected", "cancelled"].includes(data.status) ? "FAILED" : ["refunded", "charged_back"].includes(data.status) || data.transaction_amount_refunded > 0 ? "REVIEW" : "PENDING",
    method: data.payment_type_id === "credit_card" ? `Cartão de Crédito (${data.installments || 1}x)` : data.payment_method_id === "pix" ? "PIX" : "Mercado Pago" }];
}

export async function applyVerifiedPayment(payment: VerifiedPayment) {
  const idPattern = { pagbank: /^CHAR_[A-Za-z0-9_-]+$/, pagarme: /^or_[A-Za-z0-9_-]+$/, mercadopago: /^\d+$/ }[payment.gateway];
  if (!idPattern?.test(payment.id)) throw new PaymentError("Identificador de pagamento inválido no gateway.", 422);
  if (typeof payment.reference !== "string" || !payment.reference || payment.currency !== "BRL" || !Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0) throw new PaymentError("Referência, moeda ou valor inválido no gateway.", 422);
  const match = payment.reference.match(/^(.+)-parcela-(\d+)$/);
  const code = match ? match[1] : payment.reference;
  const seq = match ? Number(match[2]) : undefined;
  return prisma.$transaction(async tx => {
    await lockPayments(tx);
    const r = await tx.reservation.findUnique({ where: { code } });
    if (!r) return { paymentStatus: "IGNORED" };
    const plan = r.installmentData ? JSON.parse(r.installmentData) : null;
    const item = seq ? plan?.items?.find((i: { seq: number }) => i.seq === seq) : null;
    if (seq && !item) throw new PaymentError("Parcela divergente da reserva.", 422);
    const amountMismatch = cents(Number(seq ? item.amount : r.totalAmount)) !== payment.amountCents;
    const attemptRow = await tx.setting.findUnique({ where: { key: attemptKey(r.id, seq) } });
    const attempt: PaymentAttempt | null = attemptRow ? JSON.parse(attemptRow.value) : null;
    const expectedId = attempt?.gatewayId ?? (seq ? item.mpPaymentId : r.mpPaymentId);
    const binding = await tx.setting.findUnique({ where: { key: `payment-binding:${payment.gateway}:${payment.parentId ?? payment.id}` } });
    const knownPreviousAttempt = !!binding && JSON.parse(binding.value).reservationId === r.id && JSON.parse(binding.value).seq === (seq ?? null);
    // Checkout Pro assigns payment IDs after creating a preference. New
    // attempts are bound by gateway + immutable reference and exact amount.
    const mpPreference = payment.gateway === "mercadopago" && !!r.mpPreferenceId && (!attempt || attempt.gateway === "mercadopago");
    const differentAttempt = !!attempt && attempt.gateway !== payment.gateway || !!expectedId && expectedId !== payment.id && expectedId !== payment.parentId && !mpPreference;
    if (differentAttempt && !knownPreviousAttempt) throw new PaymentError("Pagamento não pertence à tentativa registrada.", 422);
    if (!expectedId && !attempt && !mpPreference) throw new PaymentError("Pagamento sem tentativa registrada.", 422);

    const receiptKey = `payment-receipt:${payment.gateway}:${payment.id}`;
    const processed = await tx.setting.findUnique({ where: { key: receiptKey } });
    if (processed && payment.state !== "REVIEW") return { paymentStatus: r.paymentStatus, duplicate: true };
    // Adopt payments settled before the receipt ledger was introduced. A
    // deployment must not count an existing, matching paid income twice.
    if (!processed && !attempt && !differentAttempt && !amountMismatch && payment.state === "PAID" && (seq ? item.paid : r.paymentStatus === "PAID")) {
      const legacy = await tx.financialTransaction.findFirst({ where: { reservationId: r.id, category: seq ? "INSTALLMENT" : "RESERVATION_INCOME", isPaid: true, amount: payment.amountCents / 100 } });
      if (legacy) {
        await tx.setting.create({ data: { key: receiptKey, value: JSON.stringify({ reservationId: r.id, state: "PAID" }) } });
        return { paymentStatus: r.paymentStatus, duplicate: true };
      }
    }
    if (["PENDING", "FAILED"].includes(payment.state)) {
      if (differentAttempt) return { paymentStatus: r.paymentStatus };
      if (!["PAID", "PARTIAL", "REVIEW"].includes(r.paymentStatus)) await tx.reservation.update({ where: { id: r.id }, data: { paymentStatus: payment.state, paymentMethod: payment.method } });
      if (attempt && !differentAttempt && !["PAID", "REVIEW"].includes(attempt.state)) await tx.setting.update({ where: { key: attemptKey(r.id, seq) }, data: { value: JSON.stringify({ ...attempt, state: payment.state }) } });
      return { paymentStatus: ["PAID", "PARTIAL", "REVIEW"].includes(r.paymentStatus) ? r.paymentStatus : payment.state };
    }
    let review = r.paymentStatus === "REVIEW" || differentAttempt || amountMismatch || payment.state === "REVIEW" || !["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(r.status) || isReservationHoldExpired(r);
    if (!review && payment.state === "PAID") {
      try { await assertReservationAvailability(tx, { propertyId: r.propertyId, checkIn: r.checkIn, checkOut: r.checkOut, excludeReservationId: r.id }); }
      catch (error) { if (error instanceof ReservationAvailabilityError && error.status === 409) review = true; else throw error; }
    }
    // A second charge for an already settled obligation is real money, but
    // must be reviewed rather than silently counted twice or refunded.
    if ((seq ? item.paid : r.paymentStatus === "PAID") && !processed) review = true;
    if (payment.state === "PAID" && !processed) {
      const financialId = `pay_${digest(`${payment.gateway}:${payment.id}`).slice(0, 40)}`;
      const existing = !seq && !review ? await tx.financialTransaction.findFirst({ where: { reservationId: r.id, category: "RESERVATION_INCOME", isPaid: false } }) : null;
      const data = { reservationId: r.id, propertyId: r.propertyId, type: "INCOME", category: review ? "PAYMENT_REVIEW" : seq ? "INSTALLMENT" : "RESERVATION_INCOME", description: `${review ? "Conferência necessária — " : ""}${seq ? item.label : "Reserva"} ${r.code} (${payment.gateway})`, amount: payment.amountCents / 100, isPaid: true, paidAt: new Date() };
      if (existing) await tx.financialTransaction.update({ where: { id: existing.id }, data });
      else await tx.financialTransaction.upsert({ where: { id: financialId }, create: { id: financialId, ...data }, update: {} });
      if (seq && !item.paid && !amountMismatch) { item.paid = true; item.paidAt = new Date().toISOString(); item.mpPaymentId = payment.id; }
      if (seq && !review) {
        const remaining = Math.max(0, cents(r.totalAmount) - plan.items.filter((i: { paid: boolean }) => i.paid).reduce((sum: number, i: { amount: number }) => sum + cents(i.amount), 0));
        if (remaining) await tx.financialTransaction.updateMany({ where: { reservationId: r.id, category: "RESERVATION_INCOME", isPaid: false }, data: { amount: remaining / 100 } });
        else await tx.financialTransaction.deleteMany({ where: { reservationId: r.id, category: "RESERVATION_INCOME", isPaid: false } });
      }
    }
    const allPaid = !seq || plan.items.every((i: { paid: boolean }) => i.paid);
    const paymentStatus = review ? "REVIEW" : allPaid ? "PAID" : "PARTIAL";
    await tx.reservation.update({ where: { id: r.id }, data: {
      paymentStatus, paymentMethod: payment.method, ...(seq ? { installmentData: JSON.stringify(plan) } : { mpPaymentId: payment.parentId ?? payment.id }),
      ...(payment.state === "PAID" ? { paidAt: allPaid ? new Date() : r.paidAt } : {}),
      ...(review ? { status: ["CONFIRMED", "CANCELLED", "CANCELED", "CHECKED_IN", "CHECKED_OUT"].includes(r.status) ? r.status : "PAYMENT_REVIEW" } : allPaid && r.status === "PENDING" ? { status: "CONFIRMED" } : {}),
    } });
    await tx.setting.upsert({ where: { key: receiptKey }, create: { key: receiptKey, value: JSON.stringify({ reservationId: r.id, state: payment.state }) }, update: { value: JSON.stringify({ reservationId: r.id, state: payment.state }) } });
    if (attempt) await tx.setting.update({ where: { key: attemptKey(r.id, seq) }, data: { value: JSON.stringify({ ...attempt, state: review ? "REVIEW" : "PAID" }) } });
    if (review && (!processed || JSON.parse(processed.value).state !== "REVIEW")) await tx.notification.upsert({ where: { id: `review_${digest(receiptKey).slice(0, 40)}` }, create: { id: `review_${digest(receiptKey).slice(0, 40)}`, type: "PAYMENT_REVIEW", title: "Pagamento requer conferência", message: `Reserva ${r.code}: pagamento recebido fora das condições de confirmação automática.`, data: JSON.stringify({ reservationId: r.id }) }, update: {} });
    return { paymentStatus, review };
  });
}

export async function reconcilePayment(gateway: Gateway, id: string) {
  const payments = await fetchVerifiedPayments(gateway, id);
  let result: { paymentStatus: string; review?: boolean } = { paymentStatus: "PENDING" };
  for (const payment of payments) result = await applyVerifiedPayment(payment);
  return result;
}

/** Staff attest an offline receipt; this never calls or refunds a gateway. */
export async function confirmManualPayment(input: { id?: string; code?: string; seq?: number; amount?: number; method: string; userId: string; notes?: string; resolveReview?: boolean }) {
  return prisma.$transaction(async tx => {
    await lockPayments(tx);
    const r = await tx.reservation.findUnique({ where: input.id ? { id: input.id } : { code: input.code } });
    if (!r) throw new PaymentError("Reserva não encontrada.", 404);
    if (r.paymentStatus === "PAID") return r;
    const resolving = r.paymentStatus === "REVIEW" && input.resolveReview === true;
    if (r.paymentStatus === "REVIEW" && !resolving) throw new PaymentError("Confira o pagamento e solicite explicitamente a resolução da revisão.");
    if (!["PENDING", "CONFIRMED", ...(resolving ? ["PAYMENT_REVIEW"] : [])].includes(r.status) || (isReservationHoldExpired(r) && !resolving)) throw new PaymentError("Reserva cancelada ou expirada; revise a disponibilidade antes de reativar.");
    await assertReservationAvailability(tx, { propertyId: r.propertyId, checkIn: r.checkIn, checkOut: r.checkOut, excludeReservationId: r.id });
    const plan = r.installmentData ? JSON.parse(r.installmentData) : null;
    const item = input.seq ? plan?.items?.find((i: { seq: number }) => i.seq === input.seq) : null;
    if (input.seq && !item) throw new PaymentError("Parcela não encontrada.", 404);
    if (item?.paid && !resolving) return r;
    const paid = await tx.financialTransaction.aggregate({ where: { reservationId: r.id, type: "INCOME", isPaid: true, category: { in: ["RESERVATION_INCOME", "INSTALLMENT", "PAYMENT_REVIEW"] } }, _sum: { amount: true } });
    const balance = cents(r.totalAmount) - cents(paid._sum.amount ?? 0);
    const expected = input.seq ? cents(item.amount) : balance;
    if (balance < 0) throw new PaymentError("Há recebimentos excedentes. A conciliação financeira deve ser feita pela administração.");
    if (expected > balance) throw new PaymentError("A parcela excede o saldo. Concilie os recebimentos divergentes antes de confirmar.");
    if (input.amount !== undefined && (!Number.isFinite(input.amount) || cents(input.amount) !== expected)) throw new PaymentError("O valor deve corresponder ao saldo exato da reserva ou parcela.", 400);
    if (expected > 0 && !item?.paid) {
      const existing = !input.seq ? await tx.financialTransaction.findFirst({ where: { reservationId: r.id, category: "RESERVATION_INCOME", isPaid: false } }) : null;
      const data = { reservationId: r.id, propertyId: r.propertyId, type: "INCOME", category: input.seq ? "INSTALLMENT" : "RESERVATION_INCOME", description: `${input.seq ? item.label : "Reserva"} ${r.code} — ${input.method}${input.notes ? ` — ${input.notes.slice(0, 500)}` : ""}`, amount: expected / 100, isPaid: true, paidAt: new Date(), createdById: input.userId };
      if (existing) await tx.financialTransaction.update({ where: { id: existing.id }, data });
      else await tx.financialTransaction.create({ data: { id: `manual_${digest(`${r.id}:${input.seq ?? "full"}`).slice(0, 40)}`, ...data } });
    }
    if (item) { item.paid = true; item.paidAt = new Date().toISOString(); item.paymentMethod = input.method; }
    else if (plan) for (const part of plan.items) { if (!part.paid) { part.paid = true; part.paidAt = new Date().toISOString(); part.paymentMethod = input.method; } }
    const allPaid = !item || plan.items.every((part: { paid: boolean }) => part.paid);
    if (allPaid) await tx.financialTransaction.deleteMany({ where: { reservationId: r.id, category: "RESERVATION_INCOME", isPaid: false } });
    else await tx.financialTransaction.updateMany({ where: { reservationId: r.id, category: "RESERVATION_INCOME", isPaid: false }, data: { amount: (balance - expected) / 100 } });
    return tx.reservation.update({ where: { id: r.id }, data: { paymentStatus: allPaid ? "PAID" : "PARTIAL", paymentMethod: input.method, paidAt: allPaid ? new Date() : r.paidAt, ...(plan ? { installmentData: JSON.stringify(plan) } : {}), ...(allPaid ? { status: "CONFIRMED" } : {}) } });
  });
}
