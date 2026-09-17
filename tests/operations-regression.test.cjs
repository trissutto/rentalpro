const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const next = require("next/server");
const { createTestDatabase } = require("./helpers/reservation-db.cjs");

function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file,
  }).outputText;
  new vm.Script(source, { filename: file }).runInNewContext({ module, exports: module.exports, URL, Date, Intl,
    console: { error() {}, warn() {}, log() {} }, ...globals,
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name === "next/server") return next;
      if (name === "date-fns" || name === "date-fns/locale") return require(name);
      throw new Error("Unmocked dependency: " + name);
    },
  });
  return module.exports;
}
const request = (url, init) => new next.NextRequest("https://synthetic.invalid" + url, init);

test("owner financial list, totals and annual chart isolate both direct and legacy reservation rows", async t => {
  const db = await createTestDatabase(); t.after(db.cleanup);
  const { prisma } = db;
  for (const id of ["a", "b"]) {
    await prisma.user.create({ data: { id, name: id, email: id + "@example.test", password: "synthetic", role: "OWNER" } });
    await prisma.property.create({ data: { id: "p" + id, ownerId: id, name: id, slug: id, address: "Test", city: "Test", state: "SP", basePrice: 100 } });
    await prisma.reservation.create({ data: { id: "r" + id, code: id, propertyId: "p" + id, guestName: "Test", checkIn: new Date(), checkOut: new Date(), nights: 1, totalAmount: 100, cleaningFee: 0, commission: 10, ownerAmount: 90 } });
    for (const legacy of [false, true]) await prisma.financialTransaction.create({ data: {
      propertyId: legacy ? null : "p" + id, reservationId: "r" + id, type: "INCOME", category: "RESERVATION_INCOME", description: "Synthetic", amount: id === "a" ? 100 : 900,
    } });
  }
  let user = { id: "a", role: "OWNER" };
  const route = load("src/app/api/financial/route.ts", { "@/lib/prisma": { prisma }, "@/lib/auth": { getAuthUser: async () => user } });
  const response = await route.GET(request("/api/financial?period=year"));
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.transactions.length, 2);
  assert.equal(data.summary.income, 200); assert.equal(data.monthlyData.reduce((sum, item) => sum + item.income, 0), 200);
  assert.equal((await route.GET(request("/api/financial?propertyId=pb"))).status, 404);
  assert.equal((await (await route.GET(request("/api/financial?type=EXPENSE"))).json()).monthlyData.length, 0);
  user = { id: "a", role: "CLEANER" };
  assert.equal((await route.GET(request("/api/financial"))).status, 403);
  assert.equal((await route.POST(request("/api/financial", { method: "POST" }))).status, 403);
});

test("owner reports pass complete SMTP config and count void success only; missing config and send failures are visible", async () => {
  let configured = true, fail = false;
  const messages = [];
  const prisma = {
    setting: { findMany: async () => configured ? Object.entries({ smtp_host: "smtp.example.test", smtp_port: "465", smtp_user: "sender@example.test", smtp_pass: "synthetic" }).map(([key, value]) => ({ key, value })) : [] },
    user: { findMany: async () => [{ id: "o", name: "Owner", email: "owner@example.test" }] },
    property: { findMany: async () => [] },
  };
  const route = load("src/app/api/cron/owner-report/route.ts", {
    "@/lib/prisma": { prisma }, "@/lib/cron-auth": { checkCronSecret: () => null },
    "@/lib/email": { sendMail: async options => { messages.push(options); if (fail) throw new Error("Synthetic SMTP failure"); } },
  });
  const ok = await route.GET(request("/api/cron/owner-report?month=2026-08"));
  assert.equal(ok.status, 200); assert.equal((await ok.json()).ownersSent, 1);
  assert.equal(messages[0].host, "smtp.example.test"); assert.equal(messages[0].port, 465);
  assert.equal(messages[0].pass, "synthetic"); assert.equal(messages[0].to, "owner@example.test");
  fail = true;
  const failed = await route.GET(request("/api/cron/owner-report"));
  assert.equal(failed.status, 502); assert.equal((await failed.json()).ownersSent, 0);
  configured = false;
  assert.equal((await route.GET(request("/api/cron/owner-report"))).status, 503);
  assert.equal(messages.length, 2);
  assert.equal((await route.GET(request("/api/cron/owner-report?month=2026-99"))).status, 400);
});

test("generic settings cannot read or overwrite payment locks and receipts", async () => {
  let writes = 0;
  const route = load("src/app/api/settings/route.ts", {
    "@/lib/auth": { getAuthUser: async () => ({ role: "ADMIN" }) },
    "@/lib/prisma": { prisma: { setting: { findMany: async () => [
      { key: "card_gateway", value: "pagbank" }, { key: "payment-attempt:r:full", value: "internal" }, { key: "payment-receipt:gateway:id", value: "internal" },
    ], upsert: async () => { writes++; } } } },
  });
  assert.deepEqual((await (await route.GET(request("/api/settings"))).json()).settings, { card_gateway: "pagbank" });
  for (const key of ["payment-attempt:r:full", "payment-receipt:gateway:id", "payment-binding:gateway:id"]) {
    assert.equal((await route.POST(request("/api/settings", { method: "POST", body: JSON.stringify({ key, value: "changed" }) }))).status, 400);
  }
  assert.equal(writes, 0);
});

test("session cache purge removes cached content before completion and worker activation removes legacy private cache", async () => {
  const stored = new Set(["offlineCache", "precache"]);
  const caches = { keys: async () => [...stored], delete: async name => stored.delete(name) };
  await load("src/lib/client-cache.ts", {}, { caches }).clearSessionCaches();
  assert.equal(stored.size, 0);
  stored.add("offlineCache"); stored.add("public-static");
  let activate;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../worker/index.js"), "utf8"), {
    caches, self: { addEventListener: (name, callback) => { if (name === "activate") activate = callback; } },
  });
  let completed;
  activate({ waitUntil: promise => { completed = promise; } }); await completed;
  assert.equal(stored.has("offlineCache"), false); assert.equal(stored.has("public-static"), true);
});
