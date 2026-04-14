import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { code, guests, arrivalTime, observations } = await req.json();
    if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });

    const reservation = await prisma.reservation.findUnique({
      where: { code: String(code).toUpperCase() },
      include: { property: { select: { name: true, accessInstructions: true, wifiName: true, wifiPassword: true, checkInTime: true } } },
    });
    if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });
    if (reservation.status === "CANCELLED") return NextResponse.json({ error: "Reserva cancelada" }, { status: 400 });

    // Update notes with arrival info
    const note = `\n\n✅ CHECK-IN ONLINE (${new Date().toLocaleString("pt-BR")}):\nChegada prevista: ${arrivalTime || "não informada"}\nObservações: ${observations || "nenhuma"}`;

    // Save guest documents if provided
    if (guests?.length) {
      await prisma.guest.deleteMany({ where: { reservationId: reservation.id } });
      await prisma.guest.createMany({
        data: guests.map((g: { name: string; birthDate: string; docType: string; docNumber: string }) => ({
          reservationId: reservation.id,
          name: g.name,
          birthDate: new Date(g.birthDate || "2000-01-01"),
          docType: g.docType || "CPF",
          docNumber: g.docNumber || "",
        })),
      });
    }

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        checkInCompleted: true,
        checkInCompletedAt: new Date(),
        notes: (reservation.notes || "") + note,
      },
    });

    return NextResponse.json({
      success: true,
      access: {
        instructions: reservation.property.accessInstructions,
        wifiName: reservation.property.wifiName,
        wifiPassword: reservation.property.wifiPassword,
        checkInTime: reservation.property.checkInTime,
      },
    });
  } catch (err) {
    console.error("Check-in error:", err);
    return NextResponse.json({ error: "Erro ao registrar check-in" }, { status: 500 });
  }
}
