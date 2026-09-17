const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const { createTestDatabase } = require('./helpers/reservation-db.cjs');
const root = path.resolve(__dirname, '..');

async function harness(t, overrides = {}) {
  const db = await createTestDatabase(); t.after(db.cleanup);
  const { prisma } = db;
  await prisma.user.create({ data: { id: 'staff', name: 'Synthetic staff', email: 'staff@example.test', password: 'not-a-password', role: 'ADMIN' } });
  await prisma.property.create({ data: { id: 'property', name: 'Synthetic', slug: 'synthetic', address: 'Synthetic', city: 'Synthetic', state: 'SP', basePrice: 50, ownerId: 'staff' } });
  const r = await prisma.reservation.create({ data: { id: 'reservation', code: 'RSYNTHETIC', propertyId: 'property', guestName: 'Synthetic guest', checkIn: new Date('2030-05-10T12:00Z'), checkOut: new Date('2030-05-11T12:00Z'), nights: 2, totalAmount: 100, status: 'PENDING', mpPaymentId: 'CHAR_synthetic', ...overrides } });
  await prisma.financialTransaction.create({ data: { id: 'planned-income', reservationId: r.id, propertyId: r.propertyId, type: 'INCOME', category: 'RESERVATION_INCOME', description: 'Synthetic planned income', amount: 100 } });
  const queue = [], calls = [], cache = new Map(); let allowGuest = false;
  function load(rel) {
    if (cache.has(rel)) return cache.get(rel);
    const module = { exports: {} }; cache.set(rel, module.exports);
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, rel), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const context = vm.createContext({ module, exports: module.exports, Buffer, Uint8Array, Date, URL, AbortSignal, console, process: { cwd: () => root, env: { DATABASE_URL: `file:${db.databasePath}` } },
      fetch: async (url, options) => { calls.push({ url, options }); if (!queue.length) throw new Error('Unexpected network: only synthetic responses are available'); const next = queue.shift(); if (next instanceof Error) throw next; return next; },
      require(name) {
        if (name === './prisma' || name === '@/lib/prisma') return { prisma };
        if (name === '@/lib/guest-access') return { authorizeGuestRequest: async () => allowGuest ? null : NextResponse.json({ error: 'Synthetic denied token' }, { status: 403 }) };
        if (name === '@/lib/email') return { sendMail: async () => { throw new Error('Email forbidden in this test'); }, pixEmailHtml: () => '' };
        if (name === 'next/server') return { NextRequest, NextResponse };
        if (name.startsWith('node:') || ['fs/promises', 'path', 'crypto'].includes(name)) return require(name);
        if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
        if (name.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(rel), name + '.ts')));
        throw new Error('Unexpected import: ' + name);
      } });
    new vm.Script(compiled, { filename: rel }).runInContext(context); return module.exports;
  }
  return { prisma, r, queue, calls, load, directory: path.dirname(db.databasePath), allowGuest(value = true) { allowGuest = value; }, api: load('src/lib/payment-integrity.ts'), async state() { return prisma.reservation.findUnique({ where: { id: r.id } }); }, async paidIncome() { return prisma.financialTransaction.findMany({ where: { reservationId: r.id, type: 'INCOME', isPaid: true } }); } };
}
const evidence = (extra = {}) => ({ gateway: 'pagbank', id: 'CHAR_synthetic', reference: 'RSYNTHETIC', amountCents: 10000, currency: 'BRL', state: 'PAID', method: 'PIX', ...extra });

test('confirmed payment and revenue are atomic and duplicate events settle once', async t => {
  const h = await harness(t);
  await h.api.applyVerifiedPayment(evidence()); await h.api.applyVerifiedPayment(evidence());
  assert.equal((await h.state()).status, 'CONFIRMED'); assert.equal((await h.state()).paymentStatus, 'PAID');
  const income = await h.paidIncome(); assert.equal(income.length, 1); assert.equal(income[0].amount, 100); assert.equal(income[0].id, 'planned-income');
  assert.equal(await h.prisma.setting.count({ where: { key: { startsWith: 'payment-receipt:' } } }), 1);
});
test('simultaneous callbacks cannot duplicate revenue', async t => {
  const h = await harness(t);
  const results = await Promise.allSettled([h.api.applyVerifiedPayment(evidence()), h.api.applyVerifiedPayment(evidence())]);
  assert.ok(results.some(r => r.status === 'fulfilled'));
  // A busy SQLite writer is retried with the same authenticated event.
  for (const result of results) if (result.status === 'rejected') await h.api.applyVerifiedPayment(evidence());
  assert.equal((await h.paidIncome()).length, 1);
});
test('financial insert failure rolls back reservation and receipt', async t => {
  const h = await harness(t); await h.prisma.financialTransaction.deleteMany();
  await h.prisma.$executeRawUnsafe("CREATE TRIGGER reject_income BEFORE INSERT ON financial_transactions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
  await assert.rejects(h.api.applyVerifiedPayment(evidence()));
  assert.equal((await h.state()).paymentStatus, 'PENDING'); assert.equal((await h.state()).status, 'PENDING');
  assert.equal(await h.prisma.setting.count({ where: { key: { startsWith: 'payment-receipt:' } } }), 0);
});
test('forged Pagar.me body cannot mark unpaid authenticated order as paid', async t => {
  const h = await harness(t, { mpPaymentId: 'or_synthetic' });
  await h.prisma.setting.create({ data: { key: 'pagarme_api_key', value: 'synthetic-not-a-secret' } });
  h.queue.push({ ok: true, async json() { return { id: 'or_synthetic', code: 'RSYNTHETIC', status: 'pending', amount: 10000, currency: 'BRL', charges: [] }; } });
  const route = h.load('src/app/api/webhooks/pagarme/route.ts');
  const response = await route.POST(new NextRequest('http://localhost/api/webhooks/pagarme', { method: 'POST', body: JSON.stringify({ data: { id: 'or_synthetic', code: 'RSYNTHETIC', status: 'paid', amount: 10000 } }) }));
  assert.equal(response.status, 200); assert.equal((await h.state()).paymentStatus, 'PENDING'); assert.equal((await h.paidIncome()).length, 0);
  assert.equal(h.calls[0].url, 'https://api.pagar.me/core/v5/orders/or_synthetic'); assert.match(h.calls[0].options.headers.Authorization, /^Basic /);
});
test('gateway unavailable returns retryable webhook error without mutation', async t => {
  const h = await harness(t, { mpPaymentId: 'or_synthetic' });
  await h.prisma.setting.create({ data: { key: 'pagarme_api_key', value: 'synthetic' } }); h.queue.push({ ok: false });
  const response = await h.load('src/app/api/webhooks/pagarme/route.ts').POST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ data: { id: 'or_synthetic' } }) }));
  assert.equal(response.status, 502); assert.equal((await h.state()).paymentStatus, 'PENDING');
});
test('PagBank order webhook queries /orders and settles nested charge', async t => {
  const h = await harness(t, { mpPaymentId: 'ORDE_synthetic' });
  await h.prisma.setting.create({ data: { key: 'pagbank_token', value: 'synthetic' } });
  h.queue.push({ ok: true, async json() { return { id: 'ORDE_synthetic', reference_id: 'RSYNTHETIC', charges: [{ id: 'CHAR_synthetic', status: 'PAID', amount: { value: 10000, currency: 'BRL' }, payment_method: { type: 'PIX' } }] }; } });
  assert.equal((await h.api.reconcilePayment('pagbank', 'ORDE_synthetic')).paymentStatus, 'PAID');
  assert.match(h.calls[0].url, /\/orders\/ORDE_synthetic$/); assert.equal((await h.paidIncome()).length, 1);
});
test('PagBank AUTHORIZED is pending, never captured payment', async t => {
  const h = await harness(t); await h.prisma.setting.create({ data: { key: 'pagbank_token', value: 'synthetic' } });
  h.queue.push({ ok: true, async json() { return { id: 'CHAR_synthetic', reference_id: 'RSYNTHETIC', status: 'AUTHORIZED', amount: { value: 10000, currency: 'BRL' } }; } });
  await h.api.reconcilePayment('pagbank', 'CHAR_synthetic'); assert.equal((await h.state()).paymentStatus, 'PENDING'); assert.equal((await h.paidIncome()).length, 0);
});
test('Mercado Pago authenticated amount is validated in cents', async t => {
  const h = await harness(t, { mpPaymentId: '123' }); await h.prisma.setting.create({ data: { key: 'mp_access_token', value: 'synthetic' } });
  h.queue.push({ ok: true, async json() { return { id: 123, external_reference: 'RSYNTHETIC', status: 'approved', transaction_amount: 100, currency_id: 'BRL', payment_method_id: 'pix' }; } });
  await h.api.reconcilePayment('mercadopago', '123'); assert.equal((await h.state()).paymentStatus, 'PAID');
});
for (const state of ['PENDING', 'FAILED']) test(`late ${state} event cannot downgrade captured payment`, async t => {
  const h = await harness(t); await h.api.applyVerifiedPayment(evidence()); await h.api.applyVerifiedPayment(evidence({ state }));
  assert.equal((await h.state()).paymentStatus, 'PAID'); assert.equal((await h.state()).status, 'CONFIRMED');
});
test('wrong reference and unrelated payment ID cannot modify reservation', async t => {
  const h = await harness(t); await h.api.applyVerifiedPayment(evidence({ reference: 'OTHER' }));
  await assert.rejects(h.api.applyVerifiedPayment(evidence({ id: 'CHAR_unrelated' })), /não pertence/);
  assert.equal((await h.state()).paymentStatus, 'PENDING'); assert.equal((await h.paidIncome()).length, 0);
});
test('underpayment becomes manual review for actual received amount', async t => {
  const h = await harness(t); assert.equal((await h.api.applyVerifiedPayment(evidence({ amountCents: 100 }))).paymentStatus, 'REVIEW');
  assert.equal((await h.state()).status, 'PAYMENT_REVIEW'); assert.equal((await h.paidIncome())[0].amount, 1);
});
test('wrong currency is rejected without financial mutation', async t => {
  const h = await harness(t); await assert.rejects(h.api.applyVerifiedPayment(evidence({ currency: 'USD' })), /moeda/); assert.equal((await h.paidIncome()).length, 0);
});
for (const overrides of [{ status: 'CANCELLED' }, { createdAt: new Date(Date.now() - 3 * 3600000) }]) test(`late payment ${JSON.stringify(Object.keys(overrides))} is reviewed and never confirms`, async t => {
  const h = await harness(t, overrides); await h.api.applyVerifiedPayment(evidence());
  const r = await h.state(); assert.equal(r.paymentStatus, 'REVIEW'); assert.notEqual(r.status, 'CONFIRMED'); assert.equal((await h.paidIncome()).length, 1);
});
test('paid reservation conflicting with another occupancy is reviewed', async t => {
  const h = await harness(t);
  await h.prisma.reservation.create({ data: { ...h.r, id: 'other', code: 'OTHER', status: 'CONFIRMED' } });
  await h.api.applyVerifiedPayment(evidence()); assert.equal((await h.state()).paymentStatus, 'REVIEW'); assert.equal((await h.state()).status, 'PAYMENT_REVIEW');
  assert.equal(await h.prisma.reservation.count({ where: { status: 'CONFIRMED' } }), 1);
});
test('repeat checkout uses persisted idempotency key and prevents changing gateway', async t => {
  const h = await harness(t, { mpPaymentId: null });
  const a = await h.api.beginPaymentAttempt(h.r.id, 'pagbank', 'pix'); const b = await h.api.beginPaymentAttempt(h.r.id, 'pagbank', 'pix');
  assert.equal(a.key, b.key); await assert.rejects(h.api.beginPaymentAttempt(h.r.id, 'pagarme', 'checkout'), /andamento/);
});
test('installment repeated callback creates one income and reduces remaining balance', async t => {
  const plan = { items: [{ seq: 1, label: 'Entrada', amount: 30, paid: false, mpPaymentId: 'CHAR_synthetic' }, { seq: 2, label: 'Saldo', amount: 70, paid: false, mpPaymentId: 'CHAR_balance' }] };
  const h = await harness(t, { installmentData: JSON.stringify(plan) });
  const p = evidence({ reference: 'RSYNTHETIC-parcela-1', amountCents: 3000 });
  await h.api.applyVerifiedPayment(p); await h.api.applyVerifiedPayment(p);
  assert.equal((await h.state()).paymentStatus, 'PARTIAL'); assert.equal((await h.paidIncome()).length, 1);
  assert.equal((await h.prisma.financialTransaction.findUnique({ where: { id: 'planned-income' } })).amount, 70);
  await h.api.applyVerifiedPayment(evidence({ id: 'CHAR_balance', reference: 'RSYNTHETIC-parcela-2', amountCents: 7000 }));
  assert.equal((await h.state()).paymentStatus, 'PAID'); assert.equal((await h.state()).status, 'CONFIRMED');
  assert.equal((await h.paidIncome()).reduce((n, row) => n + row.amount, 0), 100); assert.equal(await h.prisma.financialTransaction.count({ where: { isPaid: false } }), 0);
});
test('refund/dispute preserves occupancy and triggers review once', async t => {
  const h = await harness(t); await h.api.applyVerifiedPayment(evidence());
  await h.api.applyVerifiedPayment(evidence({ state: 'REVIEW' })); await h.api.applyVerifiedPayment(evidence({ state: 'REVIEW' }));
  assert.equal((await h.state()).status, 'CONFIRMED'); assert.equal((await h.state()).paymentStatus, 'REVIEW');
  assert.equal(await h.prisma.notification.count(), 1); assert.equal((await h.paidIncome()).length, 1);
});
test('manual payment requires exact balance and updates existing income once', async t => {
  const h = await harness(t); await assert.rejects(h.api.confirmManualPayment({ id: h.r.id, method: 'PIX conferido', amount: 1, userId: 'staff' }), /saldo exato/);
  await h.api.confirmManualPayment({ id: h.r.id, method: 'PIX conferido', amount: 100, userId: 'staff' });
  await h.api.confirmManualPayment({ id: h.r.id, method: 'PIX conferido', amount: 100, userId: 'staff' });
  assert.equal((await h.paidIncome()).length, 1); assert.equal((await h.state()).status, 'CONFIRMED');
});
test('manual settlement cannot bypass occupied dates', async t => {
  const h = await harness(t); await h.prisma.reservation.create({ data: { ...h.r, id: 'other', code: 'OTHER', status: 'CONFIRMED' } });
  await assert.rejects(h.api.confirmManualPayment({ id: h.r.id, method: 'Manual', userId: 'staff' }), /indisponível/);
  assert.equal((await h.state()).paymentStatus, 'PENDING');
});

for (const routeName of ['create', 'process', 'pagbank-card', 'pagbank-pix', 'pagarme-checkout', 'pay-installment', 'installment-plan']) test(`${routeName} rejects unauthorized guests before writing or calling gateway`, async t => {
  const h = await harness(t);
  const body = { code: 'RSYNTHETIC', formData: {}, encryptedCard: 'synthetic', holderName: 'Synthetic', holderCpf: '00000000000', seq: 1, method: 'pix', numInstallments: 1 };
  const response = await h.load(`src/app/api/public/payments/${routeName}/route.ts`).POST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal(response.status, 403); assert.equal(h.calls.length, 0); assert.equal((await h.state()).paymentStatus, 'PENDING');
  assert.equal(await h.prisma.setting.count(), 0);
});
test('installment plan cannot be read using commercial code alone', async t => {
  const h = await harness(t); const response = await h.load('src/app/api/public/payments/installment-plan/route.ts').GET(new NextRequest('http://localhost?code=RSYNTHETIC'));
  assert.equal(response.status, 403);
});
test('receipt upload rejects unauthorized guest before writing file', async t => {
  const h = await harness(t); const form = new FormData(); form.set('code', 'RSYNTHETIC'); form.set('seq', '1'); form.set('file', new File(['synthetic'], 'synthetic.pdf', { type: 'application/pdf' }));
  const response = await h.load('src/app/api/public/payments/upload-receipt/route.ts').POST(new NextRequest('http://localhost', { method: 'POST', body: form }));
  assert.equal(response.status, 403); assert.equal((await h.state()).installmentData, null);
});
test('new receipts are private, downloadable with guest access and denied without it', async t => {
  const h = await harness(t, { installmentData: JSON.stringify({ items: [{ seq: 1, amount: 100, paid: false }] }) }); h.allowGuest();
  const form = new FormData(); form.set('code', 'RSYNTHETIC'); form.set('seq', '1'); form.set('file', new File(['synthetic receipt'], 'synthetic.pdf', { type: 'application/pdf' }));
  const response = await h.load('src/app/api/public/payments/upload-receipt/route.ts').POST(new NextRequest('http://localhost', { method: 'POST', body: form }));
  assert.equal(response.status, 200); const body = await response.json(); assert.match(body.receiptUrl, /^\/api\/public\/payments\/receipt\/RSYNTHETIC\/parcela-1-[a-f0-9-]+\.pdf$/);
  const filename = body.receiptUrl.split('/').at(-1); assert.equal(fs.readFileSync(path.join(h.directory, 'private-receipts', 'RSYNTHETIC', filename), 'utf8'), 'synthetic receipt');
  const route = h.load('src/app/api/public/payments/receipt/[code]/[filename]/route.ts');
  const download = await route.GET(new NextRequest('http://localhost' + body.receiptUrl), { params: { code: 'RSYNTHETIC', filename } });
  assert.equal(download.status, 200); assert.equal(await download.text(), 'synthetic receipt'); assert.match(download.headers.get('Cache-Control'), /no-store/);
  h.allowGuest(false); const denied = await route.GET(new NextRequest('http://localhost' + body.receiptUrl), { params: { code: 'RSYNTHETIC', filename } }); assert.equal(denied.status, 403);
});
test('private receipt path rejects directory traversal', async t => {
  const h = await harness(t); const lib = h.load('src/lib/payment-receipts.ts');
  assert.throws(() => lib.receiptFilePath('../other', 'parcela-1-test.pdf')); assert.throws(() => lib.receiptFilePath('RSYNTHETIC', '../../synthetic.pdf'));
});
test('legacy receipt migration verifies copy, changes links and is idempotent', async t => {
  const filename = 'parcela-1-123456.pdf', oldUrl = `/uploads/receipts/RSYNTHETIC/${filename}`;
  const h = await harness(t, { installmentData: JSON.stringify({ items: [{ seq: 1, receiptUrl: oldUrl, paid: true }] }) });
  const sourceRoot = path.join(h.directory, 'legacy'), destinationRoot = path.join(h.directory, 'private-receipts');
  fs.mkdirSync(path.join(sourceRoot, 'RSYNTHETIC'), { recursive: true }); fs.writeFileSync(path.join(sourceRoot, 'RSYNTHETIC', filename), 'synthetic legacy receipt');
  const { migrateLegacyReceipts } = require('../scripts/migrate-payment-receipts.cjs');
  assert.deepEqual(await migrateLegacyReceipts({ prisma: h.prisma, sourceRoot, destinationRoot }), { copied: 1, updated: 1 });
  assert.equal(fs.existsSync(path.join(sourceRoot, 'RSYNTHETIC', filename)), false);
  assert.equal(fs.readFileSync(path.join(destinationRoot, 'RSYNTHETIC', filename), 'utf8'), 'synthetic legacy receipt');
  assert.equal(JSON.parse((await h.state()).installmentData).items[0].paid, true);
  assert.match(JSON.parse((await h.state()).installmentData).items[0].receiptUrl, /^\/api\/public/);
  assert.deepEqual(await migrateLegacyReceipts({ prisma: h.prisma, sourceRoot, destinationRoot }), { copied: 0, updated: 0 });
});
test('failed receipt migration retains original and unchanged database URL', async t => {
  const filename = 'parcela-1-123456.pdf', oldUrl = `/uploads/receipts/RSYNTHETIC/${filename}`;
  const h = await harness(t, { installmentData: JSON.stringify({ items: [{ seq: 1, receiptUrl: oldUrl }] }) });
  const sourceRoot = path.join(h.directory, 'legacy'), destinationRoot = path.join(h.directory, 'private-receipts');
  fs.mkdirSync(path.join(sourceRoot, 'RSYNTHETIC'), { recursive: true }); fs.writeFileSync(path.join(sourceRoot, 'RSYNTHETIC', filename), 'synthetic original');
  await h.prisma.$executeRawUnsafe("CREATE TRIGGER reject_receipt_update BEFORE UPDATE ON reservations WHEN NEW.installmentData != OLD.installmentData BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
  const { migrateLegacyReceipts } = require('../scripts/migrate-payment-receipts.cjs');
  await assert.rejects(migrateLegacyReceipts({ prisma: h.prisma, sourceRoot, destinationRoot }));
  assert.equal(fs.readFileSync(path.join(sourceRoot, 'RSYNTHETIC', filename), 'utf8'), 'synthetic original');
  assert.equal(JSON.parse((await h.state()).installmentData).items[0].receiptUrl, oldUrl);
});
test('payment already settled before deployment is adopted without double counting', async t => {
  const h = await harness(t, { status: 'CONFIRMED', paymentStatus: 'PAID' });
  await h.prisma.financialTransaction.update({ where: { id: 'planned-income' }, data: { isPaid: true } });
  await h.api.applyVerifiedPayment(evidence()); assert.equal((await h.paidIncome()).length, 1); assert.equal((await h.state()).paymentStatus, 'PAID');
});
test('legacy pending charge cannot silently create a second new charge', async t => {
  const h = await harness(t); await assert.rejects(h.api.beginPaymentAttempt(h.r.id, 'pagbank', 'pix'), /cobrança anterior/);
  assert.equal(await h.prisma.setting.count(), 0);
});
test('existing partial payment does not falsely mark a new pending installment paid', async t => {
  const plan = { items: [{ seq: 1, label: 'Entrada', amount: 30, paid: true, mpPaymentId: 'CHAR_entry' }, { seq: 2, label: 'Saldo', amount: 70, paid: false }] };
  const h = await harness(t, { installmentData: JSON.stringify(plan), paymentStatus: 'PARTIAL', mpPaymentId: null }); h.allowGuest();
  await h.prisma.setting.create({ data: { key: 'pagbank_token', value: 'synthetic' } });
  const charge = { id: 'CHAR_balance', reference_id: 'RSYNTHETIC-parcela-2', status: 'IN_ANALYSIS', amount: { value: 7000, currency: 'BRL' }, payment_method: { type: 'CREDIT_CARD' } };
  h.queue.push({ ok: true, async json() { return charge; } }, { ok: true, async json() { return charge; } });
  const response = await h.load('src/app/api/public/payments/pay-installment/route.ts').POST(new NextRequest('http://localhost', { method: 'POST', body: JSON.stringify({ code: 'RSYNTHETIC', seq: 2, method: 'card', encryptedCard: 'synthetic', holderName: 'Synthetic', holderCpf: '00000000000' }) }));
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.paymentStatus, 'PARTIAL'); assert.equal(body.installmentPaid, false);
});
test('a second installment cannot clear a refund review on another installment', async t => {
  const plan = { items: [{ seq: 1, label: 'Entrada', amount: 30, paid: false, mpPaymentId: 'CHAR_synthetic' }, { seq: 2, label: 'Saldo', amount: 70, paid: false, mpPaymentId: 'CHAR_balance' }] };
  const h = await harness(t, { status: 'CONFIRMED', installmentData: JSON.stringify(plan) });
  await h.api.applyVerifiedPayment(evidence({ reference: 'RSYNTHETIC-parcela-1', amountCents: 3000 }));
  await h.api.applyVerifiedPayment(evidence({ reference: 'RSYNTHETIC-parcela-1', amountCents: 3000, state: 'REVIEW' }));
  await h.api.applyVerifiedPayment(evidence({ id: 'CHAR_balance', reference: 'RSYNTHETIC-parcela-2', amountCents: 7000 }));
  assert.equal((await h.state()).paymentStatus, 'REVIEW');
});
test('manual resolution cannot add an installment above the actual remaining balance', async t => {
  const plan = { items: [{ seq: 1, label: 'Entrada', amount: 50, paid: false }, { seq: 2, label: 'Saldo', amount: 50, paid: false }] };
  const h = await harness(t, { installmentData: JSON.stringify(plan), status: 'PAYMENT_REVIEW', paymentStatus: 'REVIEW' });
  await h.prisma.financialTransaction.create({ data: { reservationId: h.r.id, propertyId: h.r.propertyId, type: 'INCOME', category: 'PAYMENT_REVIEW', description: 'Synthetic divergent income', amount: 90, isPaid: true } });
  await assert.rejects(h.api.confirmManualPayment({ id: h.r.id, seq: 1, method: 'Manual', userId: 'staff', resolveReview: true }), /excede o saldo/);
  assert.equal((await h.paidIncome()).reduce((n, row) => n + row.amount, 0), 90);
});
