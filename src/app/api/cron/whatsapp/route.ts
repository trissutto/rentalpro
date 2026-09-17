import { createGuestLink } from "@/lib/guest-access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCronSecret } from "@/lib/cron-auth";

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString("pt-BR");
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const instance = process.env.WHATSAPP_INSTANCE;

  if (!apiUrl || !apiKey) {
    console.warn("WhatsApp não configurado; envio não realizado");
    return false;
  }

  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
    const response = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: formattedPhone, textMessage: { text: message } }),
    });
    return response.ok;
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return false;
  }
}

export async function GET(req: NextRequest) {
  // Simple secret header auth for cron security
  const secret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  const denied = checkCronSecret(secret);
  if (denied) return denied;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twoDaysAhead = addDays(today, 2);

  const results = {
    bookingConfirmations: 0,
    checkInReminders: 0,
    checkoutMessages: 0,
    errors: [] as string[],
  };

  // 1. Booking confirmation — CONFIRMED reservations not yet notified
  const newReservations = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      paymentStatus: "PAID",
      waMsgBooking: false,
      guestPhone: { not: null },
    },
    include: { property: { select: { name: true, checkInTime: true, checkOutTime: true } } },
  });

  for (const r of newReservations) {
    if (!r.guestPhone) continue;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const msg = `🏠 *Reserva Confirmada!*

Olá, ${r.guestName}! Seu pagamento foi recebido e sua reserva está confirmada. ✅

📍 *Imóvel:* ${r.property.name}
📅 *Check-in:* ${formatDate(r.checkIn)} a partir das ${r.property.checkInTime || "14:00"}
📅 *Check-out:* ${formatDate(r.checkOut)} até ${r.property.checkOutTime || "12:00"}
🌙 *Diárias cobradas:* ${r.nights}
💰 *Total pago:* ${formatCurrency(r.totalAmount)}
🔑 *Código:* ${r.code}

Acompanhe sua reserva e a liberação do check-in:
${createGuestLink(r, `/checkin/${r.code}`, baseUrl)}

📄 Contrato: ${createGuestLink(r, `/api/public/contract/${r.code}`, baseUrl)}

Qualquer dúvida, estamos à disposição! 🎉`;

    const ok = await sendWhatsApp(r.guestPhone, msg);
    if (ok) {
      await prisma.reservation.update({ where: { id: r.id }, data: { waMsgBooking: true } });
      results.bookingConfirmations++;
    } else {
      results.errors.push(`Booking msg failed for ${r.code}`);
    }
  }

  // 2. Check-in reminder — 2 days before check-in
  const reminderReservations = await prisma.reservation.findMany({
    where: {
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      waMsgReminder: false,
      guestPhone: { not: null },
      checkIn: {
        gte: twoDaysAhead,
        lt: addDays(twoDaysAhead, 1),
      },
    },
    include: { property: { select: { name: true, address: true, checkInTime: true } } },
  });

  for (const r of reminderReservations) {
    if (!r.guestPhone) continue;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    let msg = `🌟 *Lembrete — Check-in em 2 dias!*

Olá, ${r.guestName}! Sua estadia está chegando 😊

🏠 *Imóvel:* ${r.property.name}
📅 *Check-in:* ${formatDate(r.checkIn)} a partir das ${r.property.checkInTime || "14:00"}
📍 *Endereço:* ${r.property.address}

`;

    msg += `\n\nAs instruções de acesso e o Wi-Fi ficam disponíveis no horário do check-in, após a confirmação do pagamento integral.\n${createGuestLink(r, `/checkin/${r.code}`, baseUrl)}`;

    const ok = await sendWhatsApp(r.guestPhone, msg);
    if (ok) {
      await prisma.reservation.update({ where: { id: r.id }, data: { waMsgReminder: true } });
      results.checkInReminders++;
    } else {
      results.errors.push(`Reminder msg failed for ${r.code}`);
    }
  }

  // 3. Check-out message — today is check-out day
  const checkoutReservations = await prisma.reservation.findMany({
    where: {
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
      waMsgCheckout: false,
      guestPhone: { not: null },
      checkOut: {
        gte: today,
        lt: addDays(today, 1),
      },
    },
    include: { property: { select: { name: true, checkOutTime: true } } },
  });

  for (const r of checkoutReservations) {
    if (!r.guestPhone) continue;
    const msg = `👋 *Bom dia, ${r.guestName}!*

Hoje é o dia do seu check-out. Esperamos que tenha aproveitado muito! 🏖️

🏠 *${r.property.name}*
📅 *Check-out:* até ${r.property.checkOutTime || "12:00"}

Por favor, deixe as chaves conforme orientado e certifique-se de não esquecer nenhum pertence.

Foi um prazer receber você! ⭐ Se quiser, deixe sua avaliação — seu feedback é muito importante.

Até a próxima! 😊`;

    const ok = await sendWhatsApp(r.guestPhone, msg);
    if (ok) {
      await prisma.reservation.update({
        where: { id: r.id },
        data: { waMsgCheckout: true },
      });
      results.checkoutMessages++;
    } else {
      results.errors.push(`Checkout msg failed for ${r.code}`);
    }
  }

  // 4. Installment reminders — parcelas vencendo em 3 dias e inadimplência
  const threeDaysAhead = addDays(today, 3);
  const adminPhone = process.env.ADMIN_WHATSAPP_PHONE || "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  let installmentReminders = 0;
  let installmentOverdueAlerts = 0;

  try {
    const reservationsWithPlans = await (prisma as any).$queryRawUnsafe(`
      SELECT id, code, checkOut, guestName, guestPhone, installmentData
      FROM reservations
      WHERE installmentData IS NOT NULL AND installmentData != ''
        AND status NOT IN ('CANCELLED', 'CANCELED', 'CHECKED_OUT', 'PAYMENT_REVIEW')
        AND paymentStatus != 'REVIEW'
    `) as any[];

    for (const r of reservationsWithPlans) {
      if (!r.installmentData) continue;
      let plan: any;
      try { plan = JSON.parse(r.installmentData); } catch { continue; }
      let planChanged = false;

      for (const item of plan.items ?? []) {
        if (item.paid) continue;
        const dueDate = new Date(item.dueDate.length === 10 ? item.dueDate + "T12:00:00" : item.dueDate);

        // Lembrete 3 dias antes — envia pro hóspede
        if (!item.reminderSent && isSameDay(dueDate, threeDaysAhead) && r.guestPhone) {
          const msg = `⏰ *Lembrete de Pagamento*

Olá, ${r.guestName}! Você tem uma parcela vencendo em 3 dias.

🏠 *Reserva:* ${r.code}
📋 *Parcela:* ${item.label}
💰 *Valor:* ${formatCurrency(item.amount)}
📅 *Vencimento:* ${formatDate(dueDate)}

👉 Acesse para pagar agora:
${createGuestLink(r, `/pagar/${r.code}`, baseUrl)}

Qualquer dúvida, estamos à disposição! 😊`;

          const ok = await sendWhatsApp(r.guestPhone, msg);
          if (ok) {
            item.reminderSent = true;
            planChanged = true;
            installmentReminders++;
          } else {
            results.errors.push(`Installment reminder failed: ${r.code} seq ${item.seq}`);
          }
        }

        // Alerta de inadimplência — envia pro admin
        if (dueDate < today && !item.overdueAlertSent && adminPhone) {
          const diasAtraso = Math.floor((today.getTime() - dueDate.getTime()) / 86400_000);
          const msg = `🚨 *Parcela Vencida — ${r.code}*

👤 *Hóspede:* ${r.guestName}
📋 *Parcela:* ${item.label}
💰 *Valor:* ${formatCurrency(item.amount)}
📅 *Venceu em:* ${formatDate(dueDate)} (${diasAtraso} dia${diasAtraso > 1 ? "s" : ""} atrás)

👉 ${baseUrl}/payments`;

          const ok = await sendWhatsApp(adminPhone, msg);
          if (ok) {
            item.overdueAlertSent = true;
            planChanged = true;
            installmentOverdueAlerts++;
          }
        }
      }

      if (planChanged) {
        await prisma.$transaction(async tx => {
          await tx.$executeRawUnsafe("UPDATE reservations SET id = id WHERE id = ?", r.id);
          const current = await tx.reservation.findUnique({ where: { id: r.id }, select: { installmentData: true } });
          if (!current?.installmentData) return;
          const fresh = JSON.parse(current.installmentData);
          for (const item of fresh.items ?? []) {
            const sent = plan.items?.find((candidate: { seq: number }) => candidate.seq === item.seq);
            if (sent?.reminderSent) item.reminderSent = true;
            if (sent?.overdueAlertSent) item.overdueAlertSent = true;
          }
          await tx.reservation.update({ where: { id: r.id }, data: { installmentData: JSON.stringify(fresh) } });
        });
      }
    }
  } catch (err) {
    console.error("Installment reminder error:", err);
    results.errors.push("Installment reminders failed: " + String(err));
  }

  console.log("WhatsApp cron completed:", { ...results, installmentReminders, installmentOverdueAlerts });
  return NextResponse.json({ ok: true, ...results, installmentReminders, installmentOverdueAlerts });
}
