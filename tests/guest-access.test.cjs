const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");
const { DatabaseSync } = require("node:sqlite");

const root = path.resolve(__dirname, "..");
const secret = "synthetic-guest-access-test-secret-not-a-real-credential";
const sampleReservation = {
  id: "r1", code: "RTEST", guestCount: 2, status: "CONFIRMED", paymentStatus: "PAID",
  checkIn: new Date("2026-09-17T12:00:00Z"), checkOut: new Date("2026-09-19T12:00:00Z"),
  notes: "internal note", checkInCompleted: false,
  property: { name: "Teste", checkInTime: "14:00", checkOutTime: "12:00", accessInstructions: "private-door", wifiName: "private-wifi", wifiPassword: "private-password" },
};

function harness({ user = null, prisma = {}, now, env = {} } = {}) {
  const modules = new Map();
  const MockDate = now ? class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  } : Date;
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative);
    const module = { exports: {} };
    modules.set(relative, module.exports);
    const source = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: relative,
    }).outputText;
    const context = {
      module, exports: module.exports, Buffer, URL, Date: MockDate, Intl, Uint8Array,
      process: { env: { JWT_SECRET: secret, ...env } }, console: { error() {}, log() {} },
      require(specifier) {
        if (["crypto", "node:crypto"].includes(specifier)) return crypto;
        if (specifier === "next/server") return { NextRequest, NextResponse };
        if (specifier === "@/lib/prisma") return { prisma };
        if (specifier === "@/lib/auth") return { getAuthUser: async () => user };
        if (specifier.startsWith("@/")) return load(`src/${specifier.slice(2)}.ts`);
        if (["child_process", "fs", "path", "os"].includes(specifier)) throw new Error("PDF generation must not execute in unauthorized tests");
        throw new Error(`Unexpected import ${specifier}`);
      },
    };
    // These safe stubs ensure authorization happens before any PDF work.
    if (relative.includes("public/contract/[code]")) {
      const original = context.require;
      context.require = specifier => ["child_process", "fs", "path", "os"].includes(specifier) ? {} : original(specifier);
    }
    new vm.Script(source, { filename: relative }).runInNewContext(context);
    modules.set(relative, module.exports);
    return module.exports;
  }
  return { load, access: load("src/lib/guest-access.ts") };
}

function request(pathname = "/api/test", token, options = {}) {
  return new NextRequest(`https://example.invalid${pathname}`, {
    ...options, headers: { ...(token ? { "x-guest-token": token } : {}), ...options.headers },
  });
}

test("guest tokens are random, bound to reservation, signed and expiring", () => {
  const { access } = harness();
  const first = access.createGuestAccess({ code: "RTEST", checkOut: "2027-01-10" });
  const second = access.createGuestAccess({ code: "RTEST", checkOut: "2027-01-10" });
  assert.notEqual(first.accessToken, second.accessToken);
  assert.equal(access.verifyGuestAccessToken(first.accessToken, "rtest", "reservation:read"), true);
  assert.equal(access.verifyGuestAccessToken(first.accessToken, "OTHER", "reservation:read"), false);
  assert.equal(access.verifyGuestAccessToken(first.accessToken, "RTEST", "reservation:read", new Date(first.accessExpiresAt).getTime()), false);
  const [payload, signature] = first.accessToken.split(".");
  const forged = JSON.parse(Buffer.from(payload, "base64url").toString());
  forged.code = "OTHER";
  assert.equal(access.verifyGuestAccessToken(`${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${signature}`, "OTHER", "reservation:read"), false);
  assert.equal(access.verifyGuestAccessToken("x".repeat(3000), "RTEST", "reservation:read"), false);
});

test("a read-only guest token cannot authorize writes", async () => {
  const { access } = harness();
  const { accessToken } = access.createGuestAccess({ code: "RTEST", checkOut: "2027-01-10" }, ["reservation:read"]);
  assert.equal(await access.authorizeGuestRequest(request("/test", accessToken), "RTEST"), null);
  const denied = await access.authorizeGuestRequest(request("/test", accessToken), "RTEST", "payments:write");
  assert.equal(denied.status, 401);
});

test("legacy code-only links fail closed and repeated failures are limited", async () => {
  const { access } = harness();
  for (let i = 0; i < 20; i++) assert.equal((await access.authorizeGuestRequest(request(), "RTEST")).status, 401);
  const limited = await access.authorizeGuestRequest(request(), "OTHER");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "900");
  assert.match(limited.headers.get("cache-control"), /no-store/);
});

test("valid links support query tokens and bounded polling", async () => {
  const { access } = harness();
  const link = access.createGuestLink({ code: "RTEST", checkOut: "2027-01-10" }, "/reserva/RTEST", "https://example.invalid");
  assert.equal(await access.authorizeGuestRequest(new NextRequest(link), "RTEST"), null);
  for (let i = 0; i < 299; i++) assert.equal(await access.authorizeGuestRequest(new NextRequest(link), "RTEST"), null);
  assert.equal((await access.authorizeGuestRequest(new NextRequest(link), "RTEST")).status, 429);
});

test("admin sessions retain access; owner sessions can only read their own reservation", async () => {
  const admin = harness({ user: { id: "admin", role: "ADMIN" } }).access;
  for (let i = 0; i < 25; i++) assert.equal(await admin.authorizeGuestRequest(request(), "RTEST"), null);
  const prisma = { reservation: { findFirst: async query => query.where.code === "OWNED" && query.where.property.ownerId === "owner" ? { id: "r1" } : null } };
  const owner = harness({ user: { id: "owner", role: "OWNER" }, prisma }).access;
  assert.equal(await owner.authorizeGuestRequest(request(), "OWNED"), null);
  assert.equal((await owner.authorizeGuestRequest(request(), "OTHER")).status, 401);
  assert.equal((await owner.authorizeGuestRequest(request(), "OWNED", "guests:write")).status, 401);
});

test("check-in requires paid confirmation and the Sao Paulo arrival/departure window", () => {
  const { access } = harness();
  const check = (patch, now) => access.checkInEligibility({ ...sampleReservation, ...patch }, new Date(now));
  assert.equal(check({}, "2026-09-17T16:59:59Z").allowed, false); // 13:59 in SP
  assert.equal(check({}, "2026-09-17T17:00:00Z").allowed, true); // 14:00 in SP
  assert.equal(check({}, "2026-09-19T14:59:59Z").allowed, true);
  assert.equal(check({}, "2026-09-19T15:00:00Z").allowed, false);
  for (const status of ["PENDING", "CANCELLED", "CHECKED_OUT"]) assert.equal(check({ status }, "2026-09-18T17:00:00Z").allowed, false);
  for (const paymentStatus of ["PENDING", "PARTIAL", "FAILED", "REFUNDED"]) assert.equal(check({ paymentStatus }, "2026-09-18T17:00:00Z").allowed, false);
});

test("guest input enforces valid dates, bounded lengths and reserved capacity", () => {
  const { access } = harness();
  const guest = { name: "Pessoa de teste", birthDate: "2000-01-01", docType: "CPF", docNumber: "synthetic-document" };
  assert.equal(access.validateGuestInput([guest], 2).length, 1);
  assert.equal(access.validateGuestInput([guest, guest, guest], 2), null);
  assert.equal(access.validateGuestInput([{ ...guest, birthDate: "2000-02-31" }], 2), null);
  assert.equal(access.validateGuestInput([{ ...guest, name: "x" }], 2), null);
  assert.equal(access.validateGuestInput([{ ...guest, docType: "unknown" }], 2), null);
});

test("guest access fails closed if the signing secret is unavailable", () => {
  const { access } = harness({ env: { JWT_SECRET: "" } });
  assert.throws(() => access.createGuestAccess({ code: "RTEST", checkOut: "2027-01-10" }), /não configurada/);
  assert.equal(access.verifyGuestAccessToken("forged.signature", "RTEST", "reservation:read"), false);
});

test("authorized reservation view excludes internal notes, gateway IDs and access instructions", async () => {
  const fixture = { ...sampleReservation, guestName: "Pessoa de teste", installmentData: JSON.stringify({
    numInstallments: 1, internalGatewaySecret: "private-plan", items: [{ seq: 1, amount: 100, paid: false, mpPaymentId: "private-gateway" }],
  }) };
  const prisma = { reservation: { findUnique: async ({ select }) => {
    assert.equal(select.notes, undefined);
    assert.equal(select.mpPaymentId, undefined);
    assert.equal(select.property.select.accessInstructions, undefined);
    const projection = Object.fromEntries(Object.entries(fixture).filter(([key]) => select[key]));
    projection.property = Object.fromEntries(Object.entries(fixture.property).filter(([key]) => select.property.select[key]));
    return projection;
  } } };
  const { load, access } = harness({ prisma, now: "2026-09-18T17:00:00Z" });
  const { accessToken } = access.createGuestAccess({ code: "RTEST", checkOut: "2026-09-19" });
  const response = await load("src/app/api/public/reservation/[code]/route.ts").GET(request("/test", accessToken), { params: { code: "RTEST" } });
  const body = await response.json();
  assert.equal(body.reservation.guestName, "Pessoa de teste");
  assert.equal(body.reservation.installmentData, undefined);
  assert.equal(body.reservation.notes, undefined);
  assert.equal(body.reservation.checkInEligibility.allowed, true);
  assert.equal(JSON.stringify(body).includes("private-"), false);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
});

for (const routePath of [
  "src/app/api/public/reservation/[code]/route.ts",
  "src/app/api/public/reservation/[code]/guests/route.ts",
  "src/app/api/public/contract-data/[code]/route.ts",
  "src/app/api/public/contract/[code]/route.ts",
]) test(`code alone is denied before database access: ${routePath}`, async () => {
  const { load } = harness({ prisma: new Proxy({}, { get() { throw new Error("Database must not be read"); } }) });
  const response = await load(routePath).GET(request(), { params: { code: "RTEST" } });
  assert.equal(response.status, 401);
  assert.equal(JSON.stringify(await response.json()).includes("synthetic-document"), false);
});

function transactionHarness({ reservation = sampleReservation, failGuestInsert = false, now = "2026-09-18T17:00:00Z" } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE guests (name TEXT); INSERT INTO guests VALUES ('preserved original'); CREATE TABLE mutations (kind TEXT)");
  const tx = {
    reservation: {
      findUnique: async () => reservation,
      update: async () => { db.exec("INSERT INTO mutations VALUES ('reservation')"); },
    },
    guest: {
      deleteMany: async () => { db.exec("DELETE FROM guests"); },
      createMany: async ({ data }) => {
        if (failGuestInsert) throw new Error("simulated insert failure");
        for (const guest of data) db.prepare("INSERT INTO guests VALUES (?)").run(guest.name);
        return { count: data.length };
      },
    },
  };
  const prisma = {
    async $transaction(fn) {
      db.exec("BEGIN");
      try { const result = await fn(tx); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  const h = harness({ prisma, now });
  const { accessToken } = h.access.createGuestAccess({ code: "RTEST", checkOut: "2026-09-19" });
  const guest = { name: "Pessoa de teste", birthDate: "2000-01-01", docType: "CPF", docNumber: "synthetic-document" };
  const req = (payload) => request("/api/public/checkin", accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { ...h, db, req, guest };
}

test("check-in never writes or reveals property secrets when payment or dates forbid access", async () => {
  for (const patch of [{ paymentStatus: "PENDING" }, { status: "CANCELLED" }, { checkIn: new Date("2026-10-01T12:00:00Z") }]) {
    const h = transactionHarness({ reservation: { ...sampleReservation, ...patch } });
    const response = await h.load("src/app/api/public/checkin/route.ts").POST(h.req({ code: "RTEST", guests: [h.guest] }));
    assert.equal(response.status, 403);
    assert.equal(JSON.stringify(await response.json()).includes("private-password"), false);
    assert.equal(h.db.prepare("SELECT COUNT(*) AS total FROM mutations").get().total, 0);
    assert.equal(h.db.prepare("SELECT name FROM guests").get().name, "preserved original");
    h.db.close();
  }
});

test("eligible check-in updates guests and completion atomically", async () => {
  const h = transactionHarness();
  const response = await h.load("src/app/api/public/checkin/route.ts").POST(h.req({ code: "RTEST", guests: [h.guest], arrivalTime: "15:00" }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).access.wifiPassword, "private-password");
  assert.equal(h.db.prepare("SELECT COUNT(*) AS total FROM mutations").get().total, 1);
  assert.equal(h.db.prepare("SELECT name FROM guests").get().name, "Pessoa de teste");
  h.db.close();
});

test("guest write failure rolls back the prior deletion and never completes check-in", async () => {
  const h = transactionHarness({ failGuestInsert: true });
  const response = await h.load("src/app/api/public/checkin/route.ts").POST(h.req({ code: "RTEST", guests: [h.guest] }));
  assert.equal(response.status, 500);
  assert.equal(h.db.prepare("SELECT name FROM guests").get().name, "preserved original");
  assert.equal(h.db.prepare("SELECT COUNT(*) AS total FROM mutations").get().total, 0);
  h.db.close();
});

test("advance guest registration works without payment and never releases access", async () => {
  const h = transactionHarness({ reservation: { ...sampleReservation, status: "PENDING", paymentStatus: "PENDING" } });
  const response = await h.load("src/app/api/public/reservation/[code]/guests/route.ts").POST(h.req({ guests: [h.guest] }), { params: { code: "RTEST" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, count: 1 });
  assert.equal(h.db.prepare("SELECT COUNT(*) AS total FROM mutations").get().total, 0);
  h.db.close();
});

test("catalogue list and detail select only public fields even when secrets exist", async () => {
  const fixture = { id: "p1", slug: "test", name: "Test house", basePrice: 100, active: true,
    accessInstructions: "private-door", wifiPassword: "private-password", wifiName: "private-wifi", icalUrls: "private-ical", ownerId: "private-owner", commissionRate: 25 };
  function select(query) {
    assert.equal(query.include, undefined);
    for (const key of ["accessInstructions", "wifiName", "wifiPassword", "icalUrls", "ownerId", "commissionRate", "owner", "_count"]) assert.equal(query.select[key], undefined);
    return Object.fromEntries(Object.entries(fixture).filter(([key]) => query.select[key]));
  }
  const prisma = { property: { findMany: async query => [select(query)], findFirst: async query => select(query) } };
  const { load } = harness({ prisma });
  const listing = await load("src/app/api/public/properties/route.ts").GET(request("/api/public/properties?city=test"));
  const detail = await load("src/app/api/public/properties/[slug]/route.ts").GET(request(), { params: { slug: "test" } });
  assert.equal(JSON.stringify(await listing.json()).includes("private-"), false);
  assert.equal(JSON.stringify(await detail.json()).includes("private-"), false);
});

test("catalogue period respects external date blocks and rejects invalid dates", async () => {
  const prisma = {
    property: { findMany: async () => [{ id: "available" }, { id: "ical" }, { id: "reserved" }] },
    reservation: { findMany: async query => { assert.ok(query.where.AND[0].OR); return [{ propertyId: "reserved" }]; } },
    $queryRawUnsafe: async (_query, id) => id === "ical" ? [{ startValue: "2026-09-18T00:00:00Z", endValue: "2026-09-20T23:59:59Z" }] : [],
  };
  const { load } = harness({ prisma });
  const route = load("src/app/api/public/properties/route.ts");
  const response = await route.GET(request("/api/public/properties?checkIn=2026-09-18&checkOut=2026-09-19"));
  assert.deepEqual((await response.json()).properties, [{ id: "available" }]);
  assert.equal((await route.GET(request("/api/public/properties?checkIn=2026-02-31&checkOut=2026-03-10"))).status, 400);
});
