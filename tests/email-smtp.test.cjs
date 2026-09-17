const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/email.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const options = { host: 'smtp.example.test', port: 465, user: 'synthetic-login', pass: 'synthetic-password-not-a-secret', from: 'Reservas Sintéticas <sender@example.test>', to: 'recipient@example.test', subject: 'Relatório sintético 🏠', html: '<p>Conteúdo sintético</p>' };
const defaults = [
  ['250-smtp.example.test\r\n250-AUTH LOGIN\r\n', '250 SIZE 1000000\r\n'],
  ['334 VXNlcm5hbWU6\r\n'], ['334 UGFzc3dvcmQ6\r\n'], ['235 authenticated\r\n'],
  ['250 sender accepted\r\n'], ['250 recipient accepted\r\n'], ['354 send content\r\n'], ['250 queued\r\n'],
];

function harness({ banner = ['220 smtp.example.test ready\r\n'], overrides = {}, connectError, quitError = false } = {}) {
  const writes = [], connections = [], timers = new Map(); let nextTimer = 1, maxErrorListeners = 0;
  const socket = new EventEmitter(); socket.destroyed = false;
  socket.destroy = () => { if (!socket.destroyed) { socket.destroyed = true; socket.emit('close'); } return socket; };
  socket.end = value => { writes.push(value); if (quitError) throw new Error('Synthetic QUIT failure'); return socket; };
  socket.write = value => {
    const index = writes.length; writes.push(value); maxErrorListeners = Math.max(maxErrorListeners, socket.listenerCount('error'));
    const response = Object.hasOwn(overrides, index) ? overrides[index] : defaults[index];
    if (typeof response === 'function') response(socket);
    else for (const chunk of response || []) socket.emit('data', Buffer.from(chunk));
    return true;
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Buffer,
    setTimeout(fn, delay) { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(name) {
      assert.equal(name, 'tls', 'No network-capable module is available to SMTP tests');
      return { connect(opts) { connections.push(opts); queueMicrotask(() => { if (connectError) socket.emit('error', new Error('Synthetic connection failure')); else for (const chunk of banner) socket.emit('data', Buffer.from(chunk)); }); return socket; } };
    },
  }, { filename: 'email.ts' });
  return { sendMail: module.exports.sendMail, socket, writes, connections, timers, maxErrorListeners: () => maxErrorListeners, timeout() { for (const timer of [...timers.values()]) { assert.equal(timer.delay, 30000); timer.fn(); } } };
}

test('SMTP succeeds only after final DATA acceptance, handles split multiline replies and keeps one error listener', async () => {
  const h = harness({ banner: ['2', '20 smtp.example.test', '\r', '\n'], overrides: { 0: ['250-smtp\r', '\n250-AUTH LOGIN\r\n250 SI', 'ZE 1000000\r\n'], 7: ['2', '50 queued\r', '\n'] } });
  assert.equal(await h.sendMail(options), undefined);
  assert.equal(h.connections[0].rejectUnauthorized, true); assert.equal(h.connections[0].servername, options.host);
  assert.equal(h.writes[4], 'MAIL FROM:<sender@example.test>\r\n'); assert.equal(h.writes[5], 'RCPT TO:<recipient@example.test>\r\n');
  assert.equal(h.writes.at(-1), 'QUIT\r\n'); assert.equal(h.maxErrorListeners(), 1); assert.equal(h.timers.size, 0); assert.equal(h.socket.destroyed, true);
  const [headers, encoded] = h.writes[7].split('\r\n\r\n'); assert.match(headers, /Subject: =\?UTF-8\?B\?/);
  assert.equal(Buffer.from(encoded.replace(/\r\n\.\r\n$/, ''), 'base64').toString('utf8'), options.html);
});

for (const [index, reply, stage] of [[0, '500 no EHLO\r\n', 'EHLO'], [1, '504 no auth\r\n', 'AUTH'], [2, '535 no user\r\n', 'usuário'], [3, '535 no auth\r\n', 'autenticação'], [4, '550 no sender\r\n', 'MAIL FROM'], [5, '550 unknown recipient\r\n', 'RCPT TO'], [6, '554 DATA refused\r\n', 'DATA'], [7, '451 temporary failure\r\n', 'mensagem']]) {
  test(`SMTP rejects ${stage} refusal and sends no later command`, async () => {
    const h = harness({ overrides: { [index]: [reply] } });
    await assert.rejects(h.sendMail(options), new RegExp(stage));
    assert.equal(h.writes.length, index + 1); assert.equal(h.socket.destroyed, true); assert.equal(h.timers.size, 0);
  });
}
test('SMTP rejects negative greeting before credentials are sent', async () => {
  const h = harness({ banner: ['421 service unavailable\r\n'] }); await assert.rejects(h.sendMail(options), /banner/); assert.equal(h.writes.length, 0);
});
test('SMTP rejects malformed multiline replies rather than treating first chunk as EHLO success', async () => {
  const h = harness({ overrides: { 0: ['250-part one\r\n', '550 changed code\r\n'] } }); await assert.rejects(h.sendMail(options), /multilinha/); assert.equal(h.writes.length, 1);
});
test('SMTP rejects a connection ending before the DATA acceptance', async () => {
  const h = harness({ overrides: { 7: socket => socket.emit('end') } }); await assert.rejects(h.sendMail(options), /encerrada/); assert.equal(h.writes.length, 8);
});
test('SMTP rejects TLS errors without sending credentials', async () => {
  const h = harness({ connectError: true }); await assert.rejects(h.sendMail(options), /conexão segura/); assert.equal(h.writes.length, 0);
});
test('SMTP has a bounded timeout even when the server never sends a greeting', async () => {
  const h = harness({ banner: [] }); const result = h.sendMail(options); h.timeout(); await assert.rejects(result, /tempo limite/); assert.equal(h.socket.destroyed, true); assert.equal(h.timers.size, 0);
});
test('SMTP stays pending until DATA confirmation and rejects timeout with ambiguous acceptance', async () => {
  const h = harness({ overrides: { 7: [] } }); let resolved = false;
  const result = h.sendMail(options).then(() => { resolved = true; });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(h.writes.length, 8); assert.equal(resolved, false); h.timeout(); await assert.rejects(result, /tempo limite/); assert.equal(resolved, false);
});
test('SMTP QUIT failure after final acceptance does not cause a duplicate resend', async () => {
  const h = harness({ quitError: true }); assert.equal(await h.sendMail(options), undefined); assert.equal(h.socket.destroyed, true);
});
test('SMTP accepts forwarding recipient reply 251', async () => {
  const h = harness({ overrides: { 5: ['251 user forwarded\r\n'] } }); assert.equal(await h.sendMail(options), undefined);
});
test('SMTP rejects header injection before opening a connection', async () => {
  for (const changes of [{ subject: 'Hello\r\nBcc: attacker@example.test' }, { to: 'recipient@example.test\r\nDATA' }, { from: 'sender@example.test\r\nBcc: other@example.test' }, { host: 'smtp.example.test\r\nDATA' }]) {
    const h = harness(); await assert.rejects(h.sendMail({ ...options, ...changes }), /inválido/); assert.equal(h.connections.length, 0);
  }
});
test('SMTP rejects unsupported STARTTLS configuration explicitly before connecting', async () => {
  const h = harness(); await assert.rejects(h.sendMail({ ...options, port: 587 }), /TLS implícito/); assert.equal(h.connections.length, 0);
});
test('SMTP bounds reply buffers and rejects unterminated oversized messages', async () => {
  const h = harness({ banner: ['220 ' + 'x'.repeat(65536)] }); await assert.rejects(h.sendMail(options), /limite/); assert.equal(h.writes.length, 0);
});
test('SMTP base64 body lines are folded and Unicode subject words remain intact', async () => {
  const h = harness(); const subject = 'Relatório de reservas 🏠 '.repeat(12), html = '<p>' + 'Olá hóspede '.repeat(100) + '</p>';
  await h.sendMail({ ...options, subject, html });
  const [headers, body] = h.writes[7].split('\r\n\r\n');
  const subjectHeader = headers.match(/Subject: ([\s\S]*?)\r\nMIME-Version/)[1];
  const decoded = [...subjectHeader.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map(match => Buffer.from(match[1], 'base64').toString('utf8')).join('');
  assert.equal(decoded, subject); assert.ok(body.split('\r\n').every(line => line.length <= 76));
});
