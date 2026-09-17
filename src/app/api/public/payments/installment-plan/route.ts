import { attemptKey, lockPayments, PaymentError } from "@/lib/payment-integrity";
import { assertReservationAvailability, isReservationHoldExpired } from "@/lib/reservation-availability";
import { authorizeGuestRequest } from "@/lib/guest-access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface InstallmentItem {
  seq: number;         // 1 = entrada, 2..n = parcelas
  label: string;       // "Entrada (30%)", "Parcela 1/2", etc.
  amount: number;
  dueDate: string;     // ISO date YYYY-MM-DD
  paid: boolean;
  paidAt?: string;
  mpPaymentId?: string;
}

export interface InstallmentPlan {
  numInstallments: number;   // total number of monthly installments (NOT counting entry)
  entryAmount: number;       // 30% of total
  installmentAmount: number; // each monthly installment
  deadline: string;          // checkIn - 7 days
  items: InstallmentItem[];
  createdAt: string;
}

/**
 * POST /api/public/payments/installment-plan
 * Body: { code: string, numInstallments: number }
 *
 * Creates (or replaces) the installment plan on a PENDING reservation.
 * - entry (30%) is due immediately (today)
 * - installments are spaced 30 days apart starting from today+30
 * - last installment must be <= checkIn - 7 days
 */
export async function POST(req: NextRequest) {
  try {
    const { code, numInstallments } = await req.json();

    if (!code || !Number.isInteger(numInstallments) || numInstallments < 1 || numInstallments > 12) {
      return NextResponse.json({ error: "code e numInstallments são obrigatórios" }, { status: 400 });
    }

    const denied = await authorizeGuestRequest(req, String(code), "payments:write");
    if (denied) return denied;
    // Load reservation
    return await prisma.$transaction(async tx => {
    await lockPayments(tx);
    const r = await tx.reservation.findUnique({ where: { code: String(code).toUpperCase() } });
    if (!r) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    if (!["PENDING", "CONFIRMED"].includes(r.status) || ["PAID", "PARTIAL", "REVIEW"].includes(r.paymentStatus) || isReservationHoldExpired(r)) throw new PaymentError("Reserva indisponível para parcelamento.");
    await assertReservationAvailability(tx, { propertyId: r.propertyId, checkIn: r.checkIn, checkOut: r.checkOut, excludeReservationId: r.id });
    const attempts = await tx.setting.findMany({ where: { key: { startsWith: "payment-attempt:" + r.id + ":" } } });
    if (attempts.length) throw new PaymentError("Não é possível substituir o plano após iniciar um pagamento.");
    if (r.installmentData && JSON.parse(r.installmentData).items?.some((i: InstallmentItem) => i.paid || i.mpPaymentId)) throw new PaymentError("O plano possui pagamentos e não pode ser substituído.");
    const total = Number(r.totalAmount);
    const checkIn = new Date(r.checkIn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Deadline = checkIn - 7 days
    const deadline = new Date(checkIn);
    deadline.setDate(deadline.getDate() - 7);

    // First installment date = today + 30 days
    const firstInstallmentDate = new Date(today);
    firstInstallmentDate.setDate(firstInstallmentDate.getDate() + 30);

    // Max installments that fit before deadline
    const maxInstallments = Math.max(
      0,
      Math.floor((deadline.getTime() - firstInstallmentDate.getTime()) / (30 * 86400 * 1000)) + 1
    );

    if (maxInstallments < 1) {
      return NextResponse.json({
        error: "Não há tempo hábil para parcelamento. Check-in muito próximo."
      }, { status: 400 });
    }

    const n = Math.min(numInstallments, maxInstallments);

    // Entry = 30%
    const entryAmount = Math.round(total * 0.30 * 100) / 100;
    const remaining = total - entryAmount;
    const installmentAmount = Math.round((remaining / n) * 100) / 100;

    // Build items
    const items: InstallmentItem[] = [];

    // Item 0: Entrada
    items.push({
      seq: 1,
      label: "Entrada (30%)",
      amount: entryAmount,
      dueDate: today.toISOString().slice(0, 10),
      paid: false,
    });

    // Monthly installments
    for (let i = 1; i <= n; i++) {
      const dueDate = new Date(firstInstallmentDate);
      dueDate.setDate(dueDate.getDate() + (i - 1) * 30);

      // Last installment: adjust amount for rounding difference
      const amount = i === n
        ? Math.round((total - entryAmount - installmentAmount * (n - 1)) * 100) / 100
        : installmentAmount;

      items.push({
        seq: i + 1,
        label: n === 1 ? "Saldo restante" : `Parcela ${i}/${n}`,
        amount,
        dueDate: dueDate.toISOString().slice(0, 10),
        paid: false,
      });
    }

    const plan: InstallmentPlan = {
      numInstallments: n,
      entryAmount,
      installmentAmount,
      deadline: deadline.toISOString().slice(0, 10),
      items,
      createdAt: new Date().toISOString(),
    };

    await tx.reservation.update({ where: { id: r.id }, data: { installmentData: JSON.stringify(plan) } });
    return NextResponse.json({ ok: true, plan });
    });
  } catch (e) {
    if (e instanceof PaymentError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("installment-plan error:", e);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * GET /api/public/payments/installment-plan?code=XXX
 * Returns the current installment plan (if any)
 */
export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code obrigatório" }, { status: 400 });

  const denied = await authorizeGuestRequest(req, code, "payments:write");
  if (denied) return denied;
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT installmentData FROM reservations WHERE code = ?`,
    code.toUpperCase()
  );
  if (!rows.length) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });

  const plan = rows[0].installmentData ? JSON.parse(rows[0].installmentData) : null;
  return NextResponse.json({ plan });
}
