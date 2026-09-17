import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POST as createPublicPayment } from "@/app/api/public/payments/create/route";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || !["ADMIN", "TEAM"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { reservationId } = await req.json();
  if (typeof reservationId !== "string") return NextResponse.json({ error: "Reserva obrigatória" }, { status: 400 });
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId }, select: { code: true } });
  if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
  return createPublicPayment(new NextRequest(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ code: reservation.code }) }));
}
