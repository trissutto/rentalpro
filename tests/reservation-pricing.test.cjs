const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const next = require("next/server");
const { createTestDatabase } = require("./helpers/reservation-db.cjs");

const root = path.resolve(__dirname, "..");
const compiled = new Map();
function compile(file) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }, fileName: file,
  }).outputText);
  return compiled.get(file);
}
const date = offset => {
  const value = new Date(); value.setUTCDate(value.getUTCDate() + 10 + offset); value.setUTCHours(0, 0, 0, 0);
  return value.toISOString().slice(0, 10);
};
const defaultInput = () => ({ propertyId: "p1", guestName: "Synthetic Guest", guestPhone: "11900000000", guestCount: 2,
  checkIn: date(0), checkOut: date(2), expectedTotal: 350 });
const request = (route, body, method = "POST") => new next.NextRequest("https://local.example.test" + route, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }),
});

async function setup(t, options = {}) {
  const database = await createTestDatabase();
  t.after(database.cleanup);
  const { prisma } = database;
  await prisma.user.create({ data: { id: "admin", name: "Synthetic Admin", email: "admin@example.test", password: "synthetic-only", role: "ADMIN" } });
  await prisma.user.create({ data: { id: "owner", name: "Synthetic Owner", email: "owner@example.test", password: "synthetic-only", role: "OWNER" } });
  await prisma.property.create({ data: { id: "p1", name: "Synthetic Property", slug: "synthetic", address: "Synthetic street", city: "Test City", state: "SP",
    basePrice: 100, cleaningFee: 50, commissionRate: 10, ownerId: "owner", maxGuests: 4, idealGuests: 2, extraGuestFee: 20 } });
  await prisma.cleaner.create({ data: { id: "cleaner", name: "Synthetic Cleaner", phone: "11900000001", region: "Test City" } });
  const state = { user: { id: "admin", role: "ADMIN" }, notifications: [], failNotifications: !!options.failNotifications };
  const modules = new Map();
  const external = {
    "next/server": next, "node:crypto": require("node:crypto"),
    "@/lib/prisma": { prisma }, "@/lib/auth": { getAuthUser: async () => state.user },
    "@/lib/guest-access": { createGuestAccess: reservation => ({ accessToken: "synthetic-token-" + reservation.code, accessExpiresAt: "2099-01-01T00:00:00Z" }), PRIVATE_GUEST_HEADERS: { "Cache-Control": "private, no-store" } },
    "./[code]/route": { GET: async () => next.NextResponse.json({ error: "Synthetic protected guest endpoint" }, { status: 401 }) },
    "@/lib/whatsapp": Object.fromEntries(["notifyNewReservation", "notifyCleanerTask"].map(name => [name, async () => {
      state.notifications.push({ name, reservations: await prisma.reservation.count(), transactions: await prisma.financialTransaction.count() });
      if (state.failNotifications) throw new Error("Synthetic notification failure");
    }])),
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const module = { exports: {} };
    const context = vm.createContext({ module, exports: module.exports, Date, URL, Intl, console: { error() {}, warn() {} },
      require(name) {
        if (Object.hasOwn(external, name)) return external[name];
        if (name.startsWith("@/")) return load("src/" + name.slice(2) + ".ts");
        throw new Error("Unexpected module: " + name);
      },
    });
    new vm.Script(compile(file), { filename: file }).runInContext(context);
    modules.set(file, module.exports);
    return module.exports;
  }
  return { prisma, state, pricing: load("src/lib/pricing.ts"), availability: load("src/lib/reservation-availability.ts"),
    public: load("src/app/api/public/reservation/route.ts"), internal: load("src/app/api/reservations/route.ts"),
    detail: load("src/app/api/reservations/[id]/route.ts"), quote: load("src/app/api/public/pricing-preview/route.ts"),
    internalQuote: load("src/app/api/reservations/quote/route.ts"),
    calendar: load("src/app/api/public/availability/route.ts") };
}

async function publicBooking(h, input = defaultInput()) {
  const response = await h.public.POST(request("/api/public/reservation", input));
  return { response, body: await response.json() };
}
const detailPatch = (h, id, body) => h.detail.PATCH(request("/api/reservations/" + id, body, "PATCH"), { params: { id } });

test("quote and creation share inclusive daily pricing, fee and commission amounts", async t => {
  const h = await setup(t);
  const input = defaultInput();
  const response = await h.quote.GET(request("/api/public/pricing-preview?" + new URLSearchParams(input), undefined, "GET"));
  const { quote } = await response.json();
  assert.equal(quote.totalAmount, 350); assert.equal(quote.ownerAmount, 265); assert.equal(quote.commission, 35);
  assert.equal(quote.diarias, 3); assert.equal(quote.nightCount, 2); assert.equal(quote.usingDefaults, false);
  const created = await publicBooking(h, { ...input, expectedTotal: quote.totalAmount });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.reservation.totalAmount, quote.totalAmount);
  assert.ok(created.body.reservation.accessToken.startsWith("synthetic-token-"));
  assert.equal(await h.prisma.cleaning.count(), 1); assert.equal(await h.prisma.financialTransaction.count(), 2);
  assert.equal(h.state.notifications.length, 0, "a pending hold must not send a confirmation");
});

test("extra guests, specific fixed tariffs and discounts are calculated by the shared server quote", async t => {
  const h = await setup(t);
  await h.prisma.pricingRule.create({ data: { propertyId: "p1", name: "Specific date", type: "HOLIDAY", priceType: "FIXED", value: 200, priority: 20,
    startDate: new Date(date(1)), endDate: new Date(date(1)) } });
  const property = await h.prisma.property.findUnique({ where: { id: "p1" }, include: { pricingRules: true } });
  const quote = h.pricing.calculateReservationQuote(property, new Date(date(0)), new Date(date(2)), 4);
  assert.equal(quote.accommodationTotal, 400); assert.equal(quote.extraGuestTotal, 120); assert.equal(quote.totalAmount, 570);
  assert.equal(quote.commission, 57); assert.equal(quote.ownerAmount, 463);
  assert.equal((await publicBooking(h, { ...defaultInput(), guestCount: 4, expectedTotal: 570 })).response.status, 201);
});

test("one-day stays are one daily charge and invalid dates or capacity are rejected", async t => {
  const h = await setup(t);
  const property = await h.prisma.property.findUnique({ where: { id: "p1" }, include: { pricingRules: true } });
  assert.equal(h.pricing.calculateReservationQuote(property, new Date(date(0)), new Date(date(0)), 2).totalAmount, 150);
  assert.throws(() => h.pricing.parseReservationStay("2099-02-30", "2099-03-02"), /Data inválida/);
  assert.throws(() => h.pricing.parseReservationStay(date(2), date(1)), /período/);
  for (const guestCount of [0, -1, 1.5, 5, "no"]) {
    assert.equal((await publicBooking(h, { ...defaultInput(), guestCount })).response.status, 422);
  }
  assert.equal(await h.prisma.reservation.count(), 0);
});

test("quote changes or a missing expected price create no reservation", async t => {
  const h = await setup(t);
  const mismatch = await publicBooking(h, { ...defaultInput(), expectedTotal: 349 });
  assert.equal(mismatch.response.status, 409); assert.equal(mismatch.body.code, "PRICE_CHANGED");
  assert.equal(mismatch.body.quote.totalAmount, 350);
  const missing = defaultInput(); delete missing.expectedTotal;
  assert.equal((await publicBooking(h, missing)).response.status, 400);
  assert.equal(await h.prisma.reservation.count(), 0);
});

test("sequential pending holds block the same dates including shared arrival/departure day", async t => {
  const h = await setup(t);
  assert.equal((await publicBooking(h)).response.status, 201);
  assert.equal((await publicBooking(h)).response.status, 409);
  assert.equal((await publicBooking(h, { ...defaultInput(), checkIn: date(2), checkOut: date(4) })).response.status, 409);
  assert.equal((await publicBooking(h, { ...defaultInput(), checkIn: date(3), checkOut: date(5) })).response.status, 201);
});

test("concurrent creates cannot both reserve the same property in SQLite", async t => {
  const h = await setup(t);
  const results = await Promise.all([publicBooking(h), publicBooking(h)]);
  assert.deepEqual(results.map(result => result.response.status).sort(), [201, 409]);
  assert.equal(await h.prisma.reservation.count(), 1);
  assert.equal(await h.prisma.financialTransaction.count(), 2);
});

test("expired unpaid holds disappear from availability and are cancelled atomically on a new booking", async t => {
  const h = await setup(t);
  await publicBooking(h);
  const old = await h.prisma.reservation.findFirst();
  await h.prisma.reservation.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 3 * 3600000) } });
  const response = await h.calendar.GET(request("/api/public/availability?propertyId=p1&months=24", undefined, "GET"));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.occupiedDates.includes(date(0)), false);
  assert.match(body.rangeStart, /^\d{4}-\d{2}-\d{2}$/); assert.ok(body.rangeEnd > body.rangeStart);
  assert.equal((await publicBooking(h)).response.status, 201);
  assert.equal((await h.prisma.reservation.findUnique({ where: { id: old.id } })).status, "CANCELLED");
  assert.equal((await h.prisma.cleaning.findUnique({ where: { reservationId: old.id } })).status, "CANCELLED");
  assert.equal(await h.prisma.financialTransaction.count({ where: { reservationId: old.id } }), 0);
});

test("partially paid holds do not expire and cannot be replaced", async t => {
  const h = await setup(t);
  await publicBooking(h);
  const old = await h.prisma.reservation.findFirst();
  await h.prisma.reservation.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 3 * 3600000), paymentStatus: "PARTIAL" } });
  assert.equal((await publicBooking(h)).response.status, 409);
});

test("SQLite blocks in ISO-text or integer milliseconds prevent a public booking", async t => {
  const h = await setup(t);
  for (const format of ["iso", "milliseconds"]) {
    await h.prisma.$executeRawUnsafe("DELETE FROM date_blocks");
    const value = format === "iso" ? date(1) + "T12:00:00.000Z" : new Date(date(1)).getTime();
    await h.prisma.$executeRawUnsafe("INSERT INTO date_blocks(id,propertyId,startDate,endDate,reason,type,createdAt) VALUES(?,?,?,?,?,'MANUAL',?)", "block", "p1", value, value, "Synthetic block", new Date().toISOString());
    assert.equal((await publicBooking(h)).response.status, 409);
  }
});

test("unreadable date blocks fail closed instead of exposing a free calendar", async t => {
  const h = await setup(t);
  await h.prisma.$executeRawUnsafe("DROP TABLE date_blocks");
  assert.equal((await publicBooking(h)).response.status, 500);
  assert.equal(await h.prisma.reservation.count(), 0);
  assert.equal((await h.calendar.GET(request("/api/public/availability?propertyId=p1", undefined, "GET"))).status, 503);
});

test("a late accounting failure rolls back reservation, cleaning and income together", async t => {
  const h = await setup(t);
  await h.prisma.$executeRawUnsafe("CREATE TRIGGER reject_repasse BEFORE INSERT ON financial_transactions WHEN NEW.category = 'OWNER_REPASSE' BEGIN SELECT RAISE(ABORT, 'Synthetic accounting failure'); END");
  const response = await h.internal.POST(request("/api/reservations", { ...defaultInput(), totalAmount: 350 }));
  assert.equal(response.status, 500);
  assert.equal(await h.prisma.reservation.count(), 0); assert.equal(await h.prisma.cleaning.count(), 0); assert.equal(await h.prisma.financialTransaction.count(), 0);
  assert.equal(h.state.notifications.length, 0);
});

test("notifications execute after commit and a notification failure preserves a successful booking", async t => {
  const h = await setup(t, { failNotifications: true });
  const response = await h.internal.POST(request("/api/reservations", { ...defaultInput(), totalAmount: 350 }));
  assert.equal(response.status, 201);
  assert.equal(h.state.notifications.length, 2);
  assert.ok(h.state.notifications.every(item => item.reservations === 1 && item.transactions === 2));
});

test("changing only a name with the unchanged guest count preserves total 350 and owner amount 265", async t => {
  const h = await setup(t);
  await publicBooking(h);
  const before = await h.prisma.reservation.findFirst();
  await h.prisma.property.update({ where: { id: "p1" }, data: { basePrice: 999, cleaningFee: 200 } });
  const response = await detailPatch(h, before.id, { guestName: "Corrected synthetic name", guestCount: "2" });
  assert.equal(response.status, 200);
  const after = await h.prisma.reservation.findUnique({ where: { id: before.id } });
  assert.equal(after.guestName, "Corrected synthetic name");
  for (const key of ["totalAmount", "cleaningFee", "commission", "ownerAmount", "nights"]) assert.equal(after[key], before[key]);
  assert.equal(after.totalAmount, 350); assert.equal(after.ownerAmount, 265);
});

test("a real guest-count change updates the shared quote and unpaid accounting coherently", async t => {
  const h = await setup(t);
  await publicBooking(h);
  const before = await h.prisma.reservation.findFirst();
  assert.equal((await detailPatch(h, before.id, { guestCount: "4", expectedTotal: 470 })).status, 200);
  const after = await h.prisma.reservation.findUnique({ where: { id: before.id }, include: { transactions: true } });
  assert.equal(after.totalAmount, 470); assert.equal(after.commission, 47); assert.equal(after.ownerAmount, 373);
  assert.equal(after.transactions.length, 2);
  assert.equal(after.transactions.find(item => item.category === "RESERVATION_INCOME").amount, 470);
  assert.equal(after.transactions.find(item => item.category === "OWNER_REPASSE").amount, 373);
});

test("moving a booking into another hold is rejected without changes", async t => {
  const h = await setup(t);
  await publicBooking(h);
  const first = await h.prisma.reservation.findFirst();
  await publicBooking(h, { ...defaultInput(), checkIn: date(4), checkOut: date(6) });
  const response = await detailPatch(h, first.id, { checkIn: date(4), checkOut: date(6) });
  assert.equal(response.status, 409);
  assert.equal((await h.prisma.reservation.findUnique({ where: { id: first.id } })).checkIn.toISOString(), first.checkIn.toISOString());
});

test("paid bookings allow clerical corrections but reject financial changes", async t => {
  const h = await setup(t);
  await publicBooking(h);
  const reservation = await h.prisma.reservation.findFirst();
  await h.prisma.reservation.update({ where: { id: reservation.id }, data: { paymentStatus: "PAID", status: "CONFIRMED" } });
  assert.equal((await detailPatch(h, reservation.id, { guestName: "Corrected", guestCount: "2" })).status, 200);
  assert.equal((await detailPatch(h, reservation.id, { guestCount: 3 })).status, 409);
});

test("reservation detail only exposes the owning owner's booking and signed guest access", async t => {
  const h = await setup(t);
  await publicBooking(h);
  const reservation = await h.prisma.reservation.findFirst();
  h.state.user = { id: "other-owner", role: "OWNER" };
  assert.equal((await h.detail.GET(request("/api/reservations/" + reservation.id, undefined, "GET"), { params: { id: reservation.id } })).status, 404);
  h.state.user = { id: "owner", role: "OWNER" };
  const response = await h.detail.GET(request("/api/reservations/" + reservation.id, undefined, "GET"), { params: { id: reservation.id } });
  assert.equal(response.status, 200); assert.ok((await response.json()).reservation.guestAccess.accessToken);
  assert.equal((await detailPatch(h, reservation.id, { guestName: "Forbidden" })).status, 403);
});

test("staff quote accepts historical dates only with ADMIN or TEAM authorization", async t => {
  const h = await setup(t);
  const query = new URLSearchParams({ propertyId: "p1", checkIn: "2020-01-01", checkOut: "2020-01-03", guestCount: "2" });
  assert.equal((await h.quote.GET(request("/api/public/pricing-preview?" + query, undefined, "GET"))).status, 400);
  for (const role of ["ADMIN", "TEAM"]) {
    h.state.user = { id: "admin", role };
    const response = await h.internalQuote.GET(request("/api/reservations/quote?" + query, undefined, "GET"));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).quote.totalAmount, 350);
  }
  for (const user of [null, { id: "owner", role: "OWNER" }, { id: "cleaner", role: "CLEANER" }]) {
    h.state.user = user;
    assert.equal((await h.internalQuote.GET(request("/api/reservations/quote?" + query, undefined, "GET"))).status, 403);
  }
});

test("staff creation ignores legacy derived totals and only accepts an explicit negotiated amount", async t => {
  const h = await setup(t);
  const wrong = await h.internal.POST(request("/api/reservations", { ...defaultInput(), expectedTotal: 300 }));
  assert.equal(wrong.status, 409); assert.equal((await wrong.json()).quote.totalAmount, 350);
  assert.equal(await h.prisma.reservation.count(), 0);
  const response = await h.internal.POST(request("/api/reservations", { ...defaultInput(), totalAmount: 9999, commission: 1, ownerAmount: 2 }));
  assert.equal(response.status, 201);
  const { reservation } = await response.json();
  assert.equal(reservation.totalAmount, 350); assert.equal(reservation.ownerAmount, 265);
  const query = new URLSearchParams({ propertyId: "p1", checkIn: date(3), checkOut: date(5), guestCount: "2", manualTotal: "300" });
  const { quote } = await (await h.internalQuote.GET(request("/api/reservations/quote?" + query, undefined, "GET"))).json();
  assert.equal(quote.totalAmount, 300); assert.equal(quote.commission, 30); assert.equal(quote.ownerAmount, 220);
  const manual = await h.internal.POST(request("/api/reservations", { ...defaultInput(), checkIn: date(3), checkOut: date(5), manualTotal: 300, expectedTotal: quote.totalAmount }));
  assert.equal(manual.status, 201); assert.equal((await manual.json()).reservation.ownerAmount, 220);
});

test("a payment attempt blocks financial edits before a gateway id is returned", async t => {
  const h = await setup(t);
  await publicBooking(h);
  const reservation = await h.prisma.reservation.findFirst();
  await h.prisma.setting.create({ data: { key: `payment-attempt:${reservation.id}:full`, value: JSON.stringify({ state: "CREATING" }) } });
  assert.equal((await detailPatch(h, reservation.id, { guestCount: 3 })).status, 409);
  assert.equal((await detailPatch(h, reservation.id, { guestName: "Corrected Name", guestCount: 2 })).status, 200);
  const unchanged = await h.prisma.reservation.findUnique({ where: { id: reservation.id } });
  assert.equal(unchanged.totalAmount, 350); assert.equal(unchanged.ownerAmount, 265);
});

test("financial edits require the current quote and roll back when the quoted price changes", async t => {
  const h = await setup(t);
  await publicBooking(h);
  const before = await h.prisma.reservation.findFirst();
  assert.equal((await detailPatch(h, before.id, { guestCount: 3 })).status, 400);
  const mismatch = await detailPatch(h, before.id, { guestCount: 3, expectedTotal: 350 });
  assert.equal(mismatch.status, 409);
  const data = await mismatch.json();
  assert.equal(data.code, "PRICE_CHANGED"); assert.equal(data.quote.totalAmount, 410);
  const unchanged = await h.prisma.reservation.findUnique({ where: { id: before.id } });
  assert.equal(unchanged.totalAmount, 350); assert.equal(unchanged.guestCount, 2);
  assert.equal((await detailPatch(h, before.id, { guestCount: 3, expectedTotal: 410 })).status, 200);
});