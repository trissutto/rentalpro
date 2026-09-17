const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const ts = require("typescript");
const { NextResponse } = require("next/server");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const urls = { a: "https://calendar.example.test/a.ics", b: "https://calendar.example.test/b.ics" };
const source = { url: urls.a, label: "Airbnb", source: "airbnb" };
const compile = (file) => ts.transpileModule(readFileSync(path.join(root, file), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file,
}).outputText;
const compiled = {
  lib: compile("src/lib/ical.ts"),
  manual: compile("src/app/api/ical-sync/route.ts"),
  cron: compile("src/app/api/cron/ical-sync/route.ts"),
  auth: compile("src/lib/cron-auth.ts"),
};
const event = ({ uid = "synthetic-airbnb-reservation", start = "20990101", end = "20990103", extra = "" } = {}) =>
  ["BEGIN:VEVENT", `UID:${uid}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, "SUMMARY:Reserved", extra, "END:VEVENT"].filter(Boolean).join("\r\n");
const calendar = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Synthetic calendar fixture//EN", ...events, "END:VCALENDAR", ""].join("\r\n");

// Uses only synthetic data in a memory-only SQLite database and a fetch replacement.
// No Prisma runtime, filesystem database, environment file, or real network is loaded.
function harness({ body = calendar(event()), status = 200, networkError, failInsert = 0, failUpdate = false,
  sources = [source], clock = "2098-12-30T12:00:00Z", user = { id: "admin", role: "ADMIN" } } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE properties(id TEXT PRIMARY KEY, name TEXT, ownerId TEXT, icalUrls TEXT);
    CREATE TABLE date_blocks(id TEXT PRIMARY KEY, propertyId TEXT, startDate DATETIME, endDate DATETIME, reason TEXT, type TEXT, source TEXT, createdAt DATETIME);`);
  db.prepare("INSERT INTO properties VALUES (?, ?, ?, ?)").run("p1", "Synthetic property", "owner1", typeof sources === "string" ? sources : JSON.stringify(sources));
  db.prepare("INSERT INTO date_blocks VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("old", "p1", "2099-01-01T12:00:00.000Z", "2099-01-03T12:00:00.000Z", "Original block", "ICAL", "airbnb", "2098-01-01T00:00:00Z");
  let inserts = 0;
  const calls = [];
  const execute = async (sql, ...args) => {
    if (/^INSERT INTO date_blocks/.test(sql) && ++inserts === failInsert) throw new Error("Synthetic insert failure");
    if (failUpdate && /^UPDATE properties/.test(sql)) throw new Error("Synthetic update failure");
    return Number(db.prepare(sql).run(...args).changes);
  };
  const query = async (sql, ...args) => db.prepare(sql).all(...args);
  const tx = { $queryRawUnsafe: query, $executeRawUnsafe: execute };
  const prisma = {
    ...tx,
    property: { findFirst: async ({ where }) => db.prepare("SELECT id, icalUrls FROM properties WHERE id = ? AND (? IS NULL OR ownerId = ?)")
      .get(where.id, where.ownerId ?? null, where.ownerId ?? null) ?? null },
    async $transaction(callback) {
      db.exec("BEGIN");
      try { const result = await callback(tx); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return new Date(clock).getTime(); }
  }
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    if (networkError) throw new Error("Synthetic network failure containing private-url-token");
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
  function load(code, imports) {
    const module = { exports: {} };
    const context = vm.createContext({ module, exports: module.exports, Date: ClockDate, URL, AbortSignal, Intl,
      fetch: fetchMock, process: { env: { CRON_SECRET: "synthetic-cron-secret" } },
      console: { log() {}, error() {} },
      require(name) { if (!(name in imports)) throw new Error(`Unexpected import: ${name}`); return imports[name]; },
    });
    new vm.Script(code).runInContext(context);
    return module.exports;
  }
  const lib = load(compiled.lib, { "@/lib/prisma": { prisma }, "node:crypto": crypto });
  const auth = load(compiled.auth, { "next/server": { NextResponse } });
  const imports = { "@/lib/prisma": { prisma }, "@/lib/auth": { getAuthUser: async () => user },
    "@/lib/ical": lib, "@/lib/cron-auth": auth, "next/server": { NextResponse } };
  return { db, lib, calls, manual: load(compiled.manual, imports), cron: load(compiled.cron, imports),
    snapshot: () => JSON.stringify({ blocks: db.prepare("SELECT * FROM date_blocks ORDER BY id").all(), properties: db.prepare("SELECT * FROM properties ORDER BY id").all() }),
  };
}

test("parses a synthetic Airbnb-style export with folded lines, BOM, escaped text and nested alarms", () => {
  const h = harness();
  const text = "\uFEFF" + calendar(event({ uid: "long-airbnb-uid-\r\n continued", extra: "SUMMARY:Reserved\\, guest\\nSecond line\r\nBEGIN:VALARM\r\nDTSTART:19990101\r\nEND:VALARM" }));
  const [result] = h.lib.parseIcal(text);
  assert.equal(result.uid, "long-airbnb-uid-continued");
  assert.equal(result.summary, "Reserved, guest\nSecond line");
  assert.equal(result.dtstart, "2099-01-01");
  assert.equal(result.dtend, "2099-01-03");
});

for (const [name, body] of [
  ["HTML with HTTP 200", "<html><body>Please log in</body></html>"],
  ["truncated calendar", calendar(event()).replace("END:VCALENDAR", "")],
  ["invalid date", calendar(event({ start: "20990230", end: "20990302" }))],
  ["missing end", calendar(event().replace("DTEND;VALUE=DATE:20990103\r\n", ""))],
  ["inverted interval", calendar(event({ start: "20990104", end: "20990103" }))],
  ["unsupported recurrence", calendar(event({ extra: "RRULE:FREQ=DAILY" }))],
  ["conflicting repeated UID", calendar(event(), event({ end: "20990105" }))],
]) {
  test(`preserves every block and source for ${name}`, async () => {
    const h = harness({ body });
    const before = h.snapshot();
    await assert.rejects(h.lib.syncIcalUrl("p1", urls.a, "Airbnb"));
    assert.equal(h.snapshot(), before);
  });
}

test("rolls back the deleted blocks and first insert if a later insert fails", async () => {
  const h = harness({ body: calendar(event({ uid: "first" }), event({ uid: "second" })), failInsert: 2 });
  const before = h.snapshot();
  await assert.rejects(h.lib.syncIcalUrl("p1", urls.a, "Airbnb"), /insert failure/);
  assert.equal(h.snapshot(), before);
});

test("rolls back all blocks when persisting source configuration fails", async () => {
  const h = harness({ failUpdate: true });
  const before = h.snapshot();
  await assert.rejects(h.lib.syncIcalUrl("p1", urls.a, "Airbnb"), /update failure/);
  assert.equal(h.snapshot(), before);
});

test("normalizes exclusive DTEND into full inclusive days used by public availability and overlap SQL", async () => {
  const h = harness({ body: calendar(event({ end: "20990102" })) });
  await h.lib.syncIcalUrl("p1", urls.a, "Airbnb");
  const block = h.db.prepare("SELECT startDate, endDate FROM date_blocks").get();
  assert.equal(block.startDate, "2099-01-01T00:00:00.000Z");
  assert.equal(block.endDate, "2099-01-01T23:59:59.999Z");
  // Same predicates used by availability (midnight in Sao Paulo) and reservation creation.
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM date_blocks WHERE endDate >= ?").get("2099-01-01T03:00:00.000Z").n, 1);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM date_blocks WHERE startDate <= ? AND endDate >= ?")
    .get("2099-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z").n, 1);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM date_blocks WHERE startDate <= ? AND endDate >= ?")
    .get("2099-01-02T00:00:00.000Z", "2099-01-02T00:00:00.000Z").n, 0);
});

test("keeps the current occupied day around UTC midnight in America/Sao_Paulo", async () => {
  const h = harness({ clock: "2099-01-01T01:00:00Z", body: calendar(event({ start: "20981231", end: "20990101" })) });
  const result = await h.lib.syncIcalUrl("p1", urls.a, "Airbnb");
  assert.equal(result.created, 1);
  assert.equal(h.db.prepare("SELECT endDate FROM date_blocks").get().endDate, "2098-12-31T23:59:59.999Z");
});

test("handles leap day and exact duplicate events without duplicated blocks", async () => {
  const item = event({ start: "21000229", end: "21000301" });
  const h = harness();
  assert.throws(() => h.lib.parseIcal(calendar(item)), /data inválida/);
  const leap = event({ start: "21040229", end: "21040301" });
  assert.equal(h.lib.parseIcal(calendar(leap, leap)).length, 1);
});

test("does not import cancelled or transparent events", () => {
  const h = harness();
  assert.equal(h.lib.parseIcal(calendar(event({ extra: "STATUS:CANCELLED" }), event({ uid: "free", extra: "TRANSP:TRANSPARENT" }))).length, 0);
});

test("coexists with another Airbnb URL and preserves the legacy source for the original URL", async () => {
  const h = harness();
  const first = await h.lib.syncIcalUrl("p1", urls.a, "Airbnb renamed");
  const second = await h.lib.syncIcalUrl("p1", urls.b, "Airbnb");
  assert.equal(first.source, "airbnb");
  assert.notEqual(second.source, first.source);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM date_blocks").get().n, 2);
  const repeated = await h.lib.syncIcalUrl("p1", urls.b, "Airbnb", second.source);
  assert.equal(repeated.source, second.source);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM date_blocks").get().n, 2);
  assert.equal(JSON.parse(h.db.prepare("SELECT icalUrls FROM properties").get().icalUrls).length, 2);
});

test("full UIDs and property identity avoid collisions with a fixed millisecond clock", async () => {
  const h = harness({ body: calendar(event({ uid: "same-first-16-chars-ONE" }), event({ uid: "same-first-16-chars-TWO" })) });
  h.db.prepare("INSERT INTO properties VALUES (?, ?, ?, ?)").run("p2", "Other synthetic property", "owner2", "[]");
  assert.equal((await h.lib.syncIcalUrl("p1", urls.a, "Airbnb")).created, 2);
  assert.equal((await h.lib.syncIcalUrl("p2", urls.a, "Airbnb")).created, 2);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM date_blocks").get().n, 4);
});

test("a valid empty calendar clears only the selected source", async () => {
  const h = harness({ body: calendar() });
  h.db.prepare("INSERT INTO date_blocks SELECT 'manual', propertyId, startDate, endDate, reason, 'MANUAL', NULL, createdAt FROM date_blocks WHERE id = 'old'").run();
  const result = await h.lib.syncIcalUrl("p1", urls.a, "Airbnb");
  assert.equal(result.deleted, 1);
  assert.equal(result.created, 0);
  assert.equal(h.db.prepare("SELECT type FROM date_blocks").get().type, "MANUAL");
});

test("normalizes webcal URLs, disables remote caching and never exposes the private URL on network errors", async () => {
  const h = harness({ networkError: true });
  await assert.rejects(h.lib.syncIcalUrl("p1", "webcal://calendar.example.test/a.ics#fragment", "Airbnb"), error => {
    assert.equal(error.message.includes("private-url-token"), false);
    return true;
  });
  assert.equal(h.calls[0].url, urls.a);
  assert.equal(h.calls[0].options.cache, "no-store");
  const count = h.calls.length;
  await assert.rejects(h.lib.syncIcalUrl("p1", "file:///private", "Airbnb"));
  assert.equal(h.calls.length, count);
});

test("malformed stored sources are not silently discarded", async () => {
  const h = harness({ sources: "{not-json}" });
  const before = h.snapshot();
  await assert.rejects(h.lib.syncIcalUrl("p1", urls.a, "Airbnb"), /configuração/);
  assert.equal(h.snapshot(), before);
  const response = await h.manual.GET(new Request("https://local.example.test/api/ical-sync?propertyId=p1"));
  assert.equal(response.status, 500);
});

test("manual sync denies another owner's property before making an external request", async () => {
  const h = harness({ user: { id: "other-owner", role: "OWNER" } });
  const response = await h.manual.POST(new Request("https://local.example.test/api/ical-sync", {
    method: "POST", body: JSON.stringify({ propertyId: "p1", url: urls.a, label: "Airbnb" }),
  }));
  assert.equal(response.status, 404);
  assert.equal(h.calls.length, 0);
});

test("deleting a saved calendar and blocks is atomic", async () => {
  const h = harness({ failUpdate: true });
  const before = h.snapshot();
  const response = await h.manual.DELETE(new Request("https://local.example.test/api/ical-sync", {
    method: "DELETE", body: JSON.stringify({ propertyId: "p1", source: "airbnb" }),
  }));
  assert.equal(response.status, 500);
  assert.equal(h.snapshot(), before);
});

test("cron accepts its secret header and reports failed imports through HTTP and JSON", async () => {
  const h = harness({ body: "<html>Not a calendar</html>" });
  const response = await h.cron.GET(new Request("https://local.example.test/api/cron/ical-sync", { headers: { "x-cron-secret": "synthetic-cron-secret" } }));
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.errors, 1);
  assert.equal(body.synced, 0);
  assert.equal(body.attempted, 1);
});

test("cron preserves a valid empty calendar and supports Bearer auth", async () => {
  const h = harness({ body: calendar() });
  const response = await h.cron.GET(new Request("https://local.example.test/api/cron/ical-sync", { headers: { Authorization: "Bearer synthetic-cron-secret" } }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.synced, 1);
  assert.equal(body.totalCreated, 0);
});

test("cron reports invalid saved JSON instead of skipping it as a success", async () => {
  const h = harness({ sources: "{not-json}" });
  const response = await h.cron.GET(new Request("https://local.example.test/api/cron/ical-sync?secret=synthetic-cron-secret"));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).errors, 1);
  assert.equal(h.calls.length, 0);
});
