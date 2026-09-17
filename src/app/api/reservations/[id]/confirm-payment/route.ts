import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { confirmManualPayment, PaymentError } from "@/lib/payment-integrity";
import { ReservationAvailabilityError } from "@/lib/reservation-availability";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || !["ADMIN", "TEAM"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const { method, notes, amount, resolveReview } = await req.json();
    if (typeof method !== "string" || !method.trim()) return NextResponse.json({ error: "Método obrigatório" }, { status: 400 });
    const reservation = await confirmManualPayment({ id: params.id, method, notes, amount, resolveReview, userId: user.id });
    return NextResponse.json({ reservation });
  } catch (error) {
    if (error instanceof PaymentError || error instanceof ReservationAvailabilityError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível confirmar o pagamento." }, { status: 503 });
  }
}
