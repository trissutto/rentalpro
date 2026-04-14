/**
 * WhatsApp Integration Module
 * Supports: Evolution API, Z-API, or direct WhatsApp Business API
 */

interface WhatsAppMessage {
  phone: string;
  message: string;
}

interface ReservationNotification {
  guestName: string;
  guestPhone: string;
  propertyName: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  totalAmount: number;
}

interface CleaningNotification {
  cleanerName: string;
  cleanerPhone: string;
  propertyName: string;
  propertyAddress: string;
  scheduledDate: Date;
  deadline: Date;
  notes?: string;
}

// Send a WhatsApp message via Evolution API or Z-API
async function sendWhatsAppMessage({ phone, message }: WhatsAppMessage): Promise<boolean> {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const instance = process.env.WHATSAPP_INSTANCE;

  if (!apiUrl || !apiKey) {
    console.log("📱 WhatsApp [SIMULADO] →", phone, ":", message.substring(0, 50) + "...");
    return true;
  }

  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    const response = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: formattedPhone,
        textMessage: { text: message },
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("Erro ao enviar WhatsApp:", error);
    return false;
  }
}

export async function notifyNewReservation(data: ReservationNotification) {
  const { guestName, guestPhone, propertyName, checkIn, checkOut, nights, totalAmount } = data;
  if (!guestPhone) return;

  const message = `🏠 *Reserva Confirmada!*

Olá, ${guestName}! Sua reserva foi confirmada.

📍 *Imóvel:* ${propertyName}
📅 *Check-in:* ${formatDate(checkIn)}
📅 *Check-out:* ${formatDate(checkOut)}
🌙 *Noites:* ${nights}
💰 *Total:* ${formatCurrency(totalAmount)}

Em breve você receberá as instruções de acesso.
Qualquer dúvida, estamos à disposição! ✅`;

  return sendWhatsAppMessage({ phone: guestPhone, message });
}

export async function notifyCleanerTask(data: CleaningNotification) {
  const { cleanerName, cleanerPhone, propertyName, propertyAddress, scheduledDate, deadline, notes } = data;

  const message = `🧹 *Nova Tarefa de Limpeza*

Olá, ${cleanerName}!

🏠 *Imóvel:* ${propertyName}
📍 *Endereço:* ${propertyAddress}
🕐 *Data:* ${formatDate(scheduledDate)} às ${formatTime(scheduledDate)}
⏰ *Prazo:* até ${formatTime(deadline)}
${notes ? `\n📝 *Observações:* ${notes}` : ""}

Por favor, confirme o recebimento! ✅`;

  return sendWhatsAppMessage({ phone: cleanerPhone, message });
}

export async function notifyCheckinReminder(data: ReservationNotification) {
  const { guestName, guestPhone, propertyName, checkIn } = data;
  if (!guestPhone) return;

  const message = `🌟 *Lembrete de Check-in*

Olá, ${guestName}! Seu check-in é amanhã.

🏠 *Imóvel:* ${propertyName}
📅 *Check-in:* ${formatDate(checkIn)} a partir das 15h

Você receberá as instruções de acesso em breve.
Boa estadia! 🎉`;

  return sendWhatsAppMessage({ phone: guestPhone, message });
}

export async function notifyCleaningLate(data: CleaningNotification) {
  const { cleanerName, cleanerPhone, propertyName } = data;

  const message = `⚠️ *ALERTA - Limpeza Atrasada*

${cleanerName}, a limpeza do imóvel *${propertyName}* está atrasada!

Por favor, atualize o status ou entre em contato.`;

  return sendWhatsAppMessage({ phone: cleanerPhone, message });
}

// Helpers
function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("pt-BR");
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
