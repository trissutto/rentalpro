/**
 * Minimal SMTP email sender using Node.js built-in tls/net modules.
 * Works with Gmail (smtp.gmail.com:465), Outlook, Brevo, etc.
 *
 * Gmail setup: use an "App Password" (Google Account → Security → App Passwords)
 */

import * as tls from "tls";

interface SendMailOptions {
  host: string;       // e.g. "smtp.gmail.com"
  port: number;       // 465 (SSL) or 587 (STARTTLS — use 465 for simplicity)
  user: string;       // login email
  pass: string;       // password or app password
  from: string;       // "Villa Mare <noreply@villamare.com.br>"
  to: string;
  subject: string;
  html: string;
}

function b64(s: string) {
  return Buffer.from(s).toString("base64");
}

function cmd(socket: tls.TLSSocket, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once("data", (d) => resolve(d.toString()));
    socket.once("error", reject);
    socket.write(text + "\r\n");
  });
}

function wait(socket: tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once("data", (d) => resolve(d.toString()));
    socket.once("error", reject);
  });
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: opts.host, port: opts.port, servername: opts.host },
      async () => {
        try {
          // Wait for banner
          await wait(socket);
          await cmd(socket, `EHLO ${opts.host}`);
          await cmd(socket, `AUTH LOGIN`);
          await cmd(socket, b64(opts.user));
          const authReply = await cmd(socket, b64(opts.pass));
          if (!authReply.startsWith("235")) {
            throw new Error(`SMTP AUTH failed: ${authReply.trim()}`);
          }
          await cmd(socket, `MAIL FROM:<${opts.user}>`);
          await cmd(socket, `RCPT TO:<${opts.to}>`);
          await cmd(socket, `DATA`);

          const boundary = `boundary_${Date.now()}`;
          const message = [
            `From: ${opts.from}`,
            `To: ${opts.to}`,
            `Subject: ${opts.subject}`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            ``,
            `--${boundary}`,
            `Content-Type: text/html; charset=UTF-8`,
            `Content-Transfer-Encoding: base64`,
            ``,
            b64(opts.html),
            ``,
            `--${boundary}--`,
          ].join("\r\n");

          const dataReply = await cmd(socket, message + "\r\n.");
          if (!dataReply.startsWith("250")) {
            throw new Error(`SMTP DATA failed: ${dataReply.trim()}`);
          }
          await cmd(socket, "QUIT");
          socket.destroy();
          resolve();
        } catch (err) {
          socket.destroy();
          reject(err);
        }
      }
    );
    socket.on("error", reject);
  });
}

// ─── Email templates ─────────────────────────────────────────────────────────

export function pixEmailHtml(opts: {
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  reservationCode: string;
  pixCode: string;          // plain text PIX key (copia e cola)
  pixQrBase64?: string;     // base64 PNG from MP (without data: prefix)
  expiresAt?: string;       // ISO date
}) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR");
  const expires = opts.expiresAt ? new Date(opts.expiresAt).toLocaleString("pt-BR") : "30 minutos";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:#4f46e5;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">🏠 ${opts.propertyName}</h1>
          <p style="margin:6px 0 0;color:#c7d2fe;font-size:14px;">Finalize seu pagamento via PIX</p>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:28px 32px 0;">
          <p style="margin:0;font-size:16px;color:#334155;">Olá, <strong>${opts.guestName}</strong>! 👋</p>
          <p style="margin:8px 0 0;color:#64748b;font-size:14px;line-height:1.6;">
            Sua reserva foi criada com sucesso. Utilize o QR Code ou o código PIX abaixo para confirmar e garantir suas datas.
          </p>
        </td></tr>

        <!-- Reservation summary -->
        <tr><td style="padding:20px 32px;">
          <table width="100%" style="background:#f8fafc;border-radius:12px;padding:16px;" cellpadding="0" cellspacing="0">
            <tr><td style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;padding-bottom:12px;">Resumo da Reserva</td></tr>
            <tr>
              <td style="font-size:13px;color:#64748b;padding:4px 0;">Check-in</td>
              <td style="font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${fmtDate(opts.checkIn)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#64748b;padding:4px 0;">Check-out</td>
              <td style="font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${fmtDate(opts.checkOut)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#64748b;padding:4px 0;">${opts.nights} noite${opts.nights > 1 ? "s" : ""}</td>
              <td style="font-size:13px;font-weight:700;color:#4f46e5;text-align:right;">${fmt(opts.totalAmount)}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#94a3b8;padding:8px 0 0;">Cód. da reserva</td>
              <td style="font-size:12px;font-weight:700;color:#334155;text-align:right;font-family:monospace;">${opts.reservationCode}</td>
            </tr>
          </table>
        </td></tr>

        ${opts.pixQrBase64 ? `
        <!-- QR Code -->
        <tr><td style="padding:0 32px;text-align:center;">
          <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#334155;">Escaneie o QR Code com seu banco:</p>
          <img src="data:image/png;base64,${opts.pixQrBase64}" width="200" height="200" alt="QR Code PIX"
               style="border-radius:12px;border:2px solid #e2e8f0;" />
        </td></tr>
        ` : ""}

        <!-- PIX code -->
        <tr><td style="padding:20px 32px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#334155;">Ou copie o código PIX:</p>
          <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:14px;word-break:break-all;font-family:monospace;font-size:11px;color:#475569;line-height:1.6;">
            ${opts.pixCode}
          </div>
        </td></tr>

        <!-- Warning -->
        <tr><td style="padding:0 32px 24px;">
          <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;">
            <p style="margin:0;font-size:12px;color:#92400e;">
              ⏳ <strong>Atenção:</strong> Este código PIX expira em <strong>${expires}</strong>.
              Após o pagamento, sua reserva será confirmada automaticamente.
            </p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            ${opts.propertyName} · Pagamento processado com segurança via Mercado Pago
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
