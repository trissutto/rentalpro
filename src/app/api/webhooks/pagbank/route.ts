import { NextRequest, NextResponse } from "next/server";
import { PaymentError, reconcilePayment } from "@/lib/payment-integrity";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body?.id ?? body?.data?.id;
    if (!id) return NextResponse.json({ error: "Identificador do pagamento obrigatório" }, { status: 400 });
    await reconcilePayment("pagbank", String(id));
    return NextResponse.json({ received: true });
  } catch (error) {
    // Transient failures must be retried by the gateway. Never acknowledge a
    // database/network failure as successfully processed.
    const status = error instanceof PaymentError ? error.status : error instanceof SyntaxError ? 400 : 503;
    return NextResponse.json({ error: status >= 500 ? "Verificação indisponível. Tente novamente." : "Notificação inválida." }, { status });
  }
}

export async function GET() { return NextResponse.json({ status: "ok" }); }
