import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { confirmManualPayment, PaymentError } from "@/lib/payment-integrity";
import { ReservationAvailabilityError } from "@/lib/reservation-availability";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || !["ADMIN", "TEAM"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const { code, seq, method = "Manual", notes, amount, resolveReview } = await req.json();
    if (typeof code !== "string" || !Number.isInteger(seq) || seq < 1 || typeof method !== "string") return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    const reservation = await confirmManualPayment({ code: code.toUpperCase(), seq, method, notes, amount, resolveReview, userId: user.id });
    const item = reservation.installmentData ? JSON.parse(reservation.installmentData).items.find((part: { seq: number }) => part.seq === seq) : null;
    return NextResponse.json({ ok: true, allPaid: reservation.paymentStatus === "PAID", item });
  } catch (error) {
    if (error instanceof PaymentError || error instanceof ReservationAvailabilityError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível confirmar a parcela." }, { status: 503 });
  }
}
