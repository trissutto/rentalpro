import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeGuestRequest, checkInEligibility, PRIVATE_GUEST_HEADERS } from "@/lib/guest-access";

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const denied = await authorizeGuestRequest(req, params.code);
  if (denied) return denied;
  const reservation = await prisma.reservation.findUnique({
    where: { code: params.code.toUpperCase() },
    select: {
      code: true, guestName: true, guestEmail: true, guestPhone: true, guestCpf: true,
      guestCount: true, checkIn: true, checkOut: true, nights: true, totalAmount: true,
      cleaningFee: true, status: true, paymentStatus: true, paymentMethod: true,
      paidAt: true, installmentData: true,
      property: { select: {
        name: true, address: true, city: true, state: true, capacity: true,
        bedrooms: true, bathrooms: true, description: true, amenities: true, rules: true,
        checkInTime: true, checkOutTime: true,
      } },
      guests: { select: { name: true, birthDate: true, docType: true, docNumber: true } },
      cleaning: { select: { status: true, completedAt: true } },
    },
  });
  if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404, headers: PRIVATE_GUEST_HEADERS });

  let installmentPlan = null;
  if (reservation.installmentData) {
    try {
      const plan = JSON.parse(reservation.installmentData);
      if (plan && Array.isArray(plan.items)) installmentPlan = {
        numInstallments: plan.numInstallments, entryAmount: plan.entryAmount,
        installmentAmount: plan.installmentAmount, deadline: plan.deadline, createdAt: plan.createdAt,
        items: plan.items.map((item: Record<string, unknown>) => ({
          seq: item.seq, label: item.label, amount: item.amount, dueDate: item.dueDate,
          paid: item.paid, paidAt: item.paidAt, receiptUrl: item.receiptUrl,
        })),
      };
    } catch { /* An invalid stored plan is not a public error or access credential. */ }
  }
  const { installmentData: _privatePlan, ...details } = reservation;
  return NextResponse.json({ reservation: {
    ...details, installmentPlan, checkInEligibility: checkInEligibility(reservation),
  } }, { headers: PRIVATE_GUEST_HEADERS });
}
