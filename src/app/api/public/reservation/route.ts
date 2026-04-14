import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addHours } from "date-fns";
import { notifyNewReservation, notifyCleanerTask } from "@/lib/whatsapp";
import { calculateDynamicTotal } from "@/lib/pricing";

// Buscar reserva por código (para o hóspede)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });

  const reservation = await prisma.reservation.findUnique({
    where: { code: code.toUpperCase() },
    include: {
      property: {
        select: {
          name: true, address: true, city: true, state: true,
          description: true, amenities: true, rules: true,
          capacity: true, bedrooms: true, bathrooms: true,
        },
      },
      cleaning: { select: { status: true, completedAt: true } },
    },
  });

  if (!reservation) return NextResponse.json({ error: "Reserva não encontrada" }, { status: 404 });

  // Retornar apenas dados públicos (sem financeiro completo)
  return NextResponse.json({
    reservation: {
      id: reservation.id,
      code: reservation.code,
      guestName: reservation.guestName,
      guestPhone: reservation.guestPhone,
      guestCount: reservation.guestCount,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      nights: reservation.nights,
      status: reservation.status,
      notes: reservation.notes,
      property: reservation.property,
      cleaning: reservation.cleaning,
    },
  });
}

// Criar reserva pública (pelo hóspede)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      propertyId, guestName, guestEmail, guestPhone,
      guestCount, checkIn, checkOut, notes,
    } = body;

    if (!propertyId || !guestName || !guestPhone || !checkIn || !checkOut) {
      return NextResponse.json({ error: "Preencha todos os campos obrigatórios" }, { status: 400 });
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId, active: true },
      include: {
        pricingRules: {
          // Include all rule types — PACKAGE needed for minNights validation
          where: { active: true },
        },
      },
    });
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

    const ci = new Date(checkIn);
    const co = new Date(checkOut);
    const nights = Math.ceil((co.getTime() - ci.getTime()) / 86400000) + 1;
    if (nights <= 0) return NextResponse.json({ error: "Datas inválidas" }, { status: 400 });

    // ── Validação de estadia mínima ───────────────────────────────────────
    const checkInStr = ci.toISOString().slice(0, 10);
    const checkInDow = ci.getUTCDay();
    const activeRules = property.pricingRules as unknown as Array<{
      type: string; startDate: Date | null; endDate: Date | null;
      daysOfWeek: string | null; minNights: number;
    }>;
    let minRequired = 1;
    let minRuleName = "";
    for (const rule of activeRules) {
      const ruleMin = rule.minNights ?? 1;
      if (ruleMin <= 1) continue;
      if (rule.type === "PACKAGE" && rule.startDate && rule.endDate) {
        const start = rule.startDate.toISOString().slice(0, 10);
        const end   = rule.endDate.toISOString().slice(0, 10);
        if (checkInStr >= start && checkInStr <= end && ruleMin > minRequired) {
          minRequired = ruleMin; minRuleName = "";
        }
      } else if (rule.type === "WEEKEND" && rule.daysOfWeek) {
        const days: number[] = JSON.parse(rule.daysOfWeek);
        if (days.includes(checkInDow) && ruleMin > minRequired) {
          minRequired = ruleMin; minRuleName = "fim de semana";
        }
      }
    }
    if (nights < minRequired) {
      const label = minRuleName ? ` (${minRuleName})` : "";
      return NextResponse.json(
        { error: `Estadia mínima para este período: ${minRequired} noites${label}` },
        { status: 422 }
      );
    }

    // Auto-cancel PENDING reservations older than 2 hours (never paid)
    const expiryThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await prisma.reservation.updateMany({
      where: {
        propertyId,
        status: "PENDING",
        paymentStatus: { in: ["PENDING", "FAILED"] },
        createdAt: { lt: expiryThreshold },
      },
      data: { status: "CANCELLED" },
    });

    // Verificar conflito com reservas existentes
    const conflict = await prisma.reservation.findFirst({
      where: {
        propertyId,
        status: { in: ["CONFIRMED", "CHECKED_IN"] },
        AND: [{ checkIn: { lt: co } }, { checkOut: { gt: ci } }],
      },
    });
    if (conflict) return NextResponse.json({ error: "Imóvel indisponível nessas datas" }, { status: 409 });

    // Verificar conflito com bloqueios manuais / iCal
    try {
      const blockRows: any[] = await (prisma as any).$queryRawUnsafe(
        `SELECT reason FROM date_blocks
         WHERE propertyId = ? AND startDate <= ? AND endDate >= ? LIMIT 1`,
        propertyId, co.toISOString(), ci.toISOString()
      );
      if (blockRows.length > 0) {
        return NextResponse.json(
          { error: `Datas bloqueadas: ${blockRows[0].reason}` },
          { status: 409 }
        );
      }
    } catch {
      // Table may not exist yet — skip block check
    }

    // Apply dynamic pricing rules (exclude PACKAGE type from price calculation — used only for minNights)
    const pricingRulesForCalc = property.pricingRules.filter(r => r.type !== "PACKAGE");
    const { total: accommodationTotal } = calculateDynamicTotal(ci, co, property.basePrice, pricingRulesForCalc);

    // Extra guest fee: (guestCount - idealGuests) × extraGuestFee × nights
    const idealGuests = (property as unknown as Record<string, number>).idealGuests ?? 2;
    const extraGuestFeePerNight = (property as unknown as Record<string, number>).extraGuestFee ?? 0;
    const guestCountNum = Number(guestCount) || 1;
    const extraGuests = Math.max(0, guestCountNum - idealGuests);
    const extraGuestTotal = extraGuests * extraGuestFeePerNight * nights;

    const total = accommodationTotal + property.cleaningFee + extraGuestTotal;
    const commission = total * (property.commissionRate / 100);
    const ownerAmount = total - commission - property.cleaningFee;
    const code = `R${Date.now().toString(36).toUpperCase()}`;

    const reservation = await prisma.reservation.create({
      data: {
        code,
        propertyId,
        guestName,
        guestEmail,
        guestPhone,
        guestCount: Number(guestCount) || 1,
        checkIn: ci,
        checkOut: co,
        nights,
        totalAmount: total,
        cleaningFee: property.cleaningFee,
        commission,
        ownerAmount,
        status: "PENDING",
        source: "DIRECT",
        notes,
      },
    });

    // Limpeza automática
    const cleaner = await prisma.cleaner.findFirst({ where: { active: true } });
    await prisma.cleaning.create({
      data: {
        propertyId,
        reservationId: reservation.id,
        cleanerId: cleaner?.id,
        scheduledDate: co,
        deadline: addHours(co, 4),
        status: "PENDING",
      },
    });

    // WhatsApp para hóspede
    await notifyNewReservation({
      guestName,
      guestPhone,
      propertyName: property.name,
      checkIn: ci,
      checkOut: co,
      nights,
      totalAmount: total,
    });

    return NextResponse.json({ reservation: { code: reservation.code, status: reservation.status, total } }, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Erro ao criar reserva" }, { status: 500 });
  }
}
