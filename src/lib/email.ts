/** SMTP submission over implicit TLS (normally port 465), without external dependencies. */
import * as tls from "tls";

interface SendMailOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}

const SMTP_TIMEOUT_MS = 30_000;
function b64(value: string) { return Buffer.from(value, "utf8").toString("base64"); }

/** Each reply ends at its final code + space line, not at a TCP chunk boundary. */
class SmtpReplies {
  private buffer = "";
  private multilineCode: number | null = null;
  private replyBytes = 0;
  private replies: number[] = [];
  private pending: { resolve: (code: number) => void; reject: (error: Error) => void } | null = null;
  private failure: Error | null = null;

  constructor(private socket: tls.TLSSocket) {
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("end", this.onEnd);
    socket.on("close", this.onEnd);
  }

  private onError = () => this.fail(new Error("SMTP: falha na conexão segura."));
  private onEnd = () => this.fail(new Error("SMTP: conexão encerrada antes da confirmação."));
  private onData = (chunk: Buffer) => {
    if (this.failure) return;
    this.buffer += chunk.toString("utf8");
    if (this.buffer.length + this.replyBytes > 65536) { this.fail(new Error("SMTP: resposta excedeu o limite.")); return; }
    let end: number;
    while ((end = this.buffer.indexOf("\r\n")) !== -1) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const match = /^([2-5][0-9]{2})(?:([ -])(.*))?$/.exec(line);
      if (!match) { this.fail(new Error("SMTP: resposta inválida.")); return; }
      const code = Number(match[1]);
      if (this.multilineCode !== null && this.multilineCode !== code) { this.fail(new Error("SMTP: resposta multilinha inconsistente.")); return; }
      this.replyBytes += line.length + 2;
      if (match[2] === "-") { this.multilineCode = code; continue; }
      this.multilineCode = null;
      this.replyBytes = 0;
      if (this.pending) { const pending = this.pending; this.pending = null; pending.resolve(code); }
      else { this.replies.push(code); if (this.replies.length > 8) { this.fail(new Error("SMTP: respostas inesperadas.")); return; } }
    }
  };

  fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    if (this.pending) { this.pending.reject(error); this.pending = null; }
  }

  next(): Promise<number> {
    if (this.replies.length) return Promise.resolve(this.replies.shift()!);
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new Error("SMTP: comandos concorrentes não permitidos."));
    return new Promise((resolve, reject) => { this.pending = { resolve, reject }; });
  }

  async expect(allowed: number[], stage: string, command?: string) {
    if (this.failure) throw this.failure;
    const reply = this.next(); // Install waiter before writing: replies may arrive immediately.
    if (command !== undefined) {
      try { this.socket.write(command + "\r\n"); }
      catch { this.fail(new Error("SMTP: não foi possível enviar o comando.")); }
    }
    const code = await reply;
    if (!allowed.includes(code)) throw new Error(`SMTP ${stage} recusado (${code}).`);
  }
}

function validateHeader(value: string, label: string) {
  if (typeof value !== "string" || /[\r\n\0]/.test(value)) throw new Error(`SMTP: ${label} inválido.`);
}

function mailbox(value: string, label: string) {
  validateHeader(value, label);
  const address = (value.match(/<([^<>]+)>\s*$/)?.[1] || value).trim();
  if (address.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(address)) throw new Error(`SMTP: ${label} inválido.`);
  return address;
}

/** RFC 2047 words stay short and never split a UTF-8 character between words. */
function encodedHeader(value: string) {
  const words: string[] = []; let part = "";
  for (const character of value) {
    if (Buffer.byteLength(part + character, "utf8") > 42) { words.push(`=?UTF-8?B?${b64(part)}?=`); part = ""; }
    part += character;
  }
  if (part || !words.length) words.push(`=?UTF-8?B?${b64(part)}?=`);
  return words.join("\r\n ");
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  validateHeader(opts.host, "servidor");
  validateHeader(opts.subject, "assunto");
  if (!opts.host || /\s/.test(opts.host) || !Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535 || !opts.user || !opts.pass) throw new Error("SMTP: configuração incompleta.");
  if (opts.port === 587) throw new Error("SMTP: configure TLS implícito na porta 465; STARTTLS não é suportado neste transporte.");
  const fromAddress = mailbox(opts.from, "remetente");
  const toAddress = mailbox(opts.to, "destinatário");
  const displayName = opts.from.includes("<") ? opts.from.slice(0, opts.from.indexOf("<")).trim().replace(/^"|"$/g, "") : "";
  const from = displayName ? `${encodedHeader(displayName)} <${fromAddress}>` : fromAddress;
  const html = b64(opts.html).match(/.{1,76}/g)?.join("\r\n") || "";
  const message = [
    `From: ${from}`, `To: ${toAddress}`, `Subject: ${encodedHeader(opts.subject)}`,
    "MIME-Version: 1.0", 'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64", "", html,
  ].join("\r\n");
  const socket = tls.connect({ host: opts.host, port: opts.port, servername: opts.host, rejectUnauthorized: true });
  const replies = new SmtpReplies(socket);
  const timer = setTimeout(() => { replies.fail(new Error("SMTP: tempo limite sem confirmação do servidor.")); socket.destroy(); }, SMTP_TIMEOUT_MS);
  try {
    await replies.expect([220], "banner");
    await replies.expect([250], "EHLO", `EHLO ${opts.host}`);
    await replies.expect([334], "AUTH", "AUTH LOGIN");
    await replies.expect([334], "usuário", b64(opts.user));
    await replies.expect([235], "autenticação", b64(opts.pass));
    await replies.expect([250], "MAIL FROM", `MAIL FROM:<${fromAddress}>`);
    await replies.expect([250, 251], "RCPT TO", `RCPT TO:<${toAddress}>`);
    await replies.expect([354], "DATA", "DATA");
    await replies.expect([250], "mensagem", message + "\r\n.");
    // The final 250 means the SMTP server accepted responsibility. A QUIT
    // disconnect must not turn accepted mail into a failure and trigger resend.
    try { socket.end("QUIT\r\n"); } catch { /* message already accepted */ }
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
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
              <td style="font-size:13px;color:#64748b;padding:4px 0;">${opts.nights} diária${opts.nights > 1 ? "s" : ""} cobrada${opts.nights > 1 ? "s" : ""}</td>
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
