const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const next = require("next/server");
const { createTestDatabase } = require("./helpers/reservation-db.cjs");
const root = path.resolve(__dirname, "..");
function load(file, imports, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: file,
  }).outputText;
  new vm.Script(source, { filename: file }).runInNewContext({ module, exports: module.exports, URL, Date, Intl, console: { error() {}, log() {}, warn() {} }, ...globals,
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; if (name === "next/server") return next; throw new Error("Unmocked dependency: " + name); },
  });
  return module.exports;
}
const request = path => new next.NextRequest("https://synthetic.invalid" + path);

test("installment data and totals are scoped to the owner, while review is not presented as settled income", async t => {
  const db = await createTestDatabase(); t.after(db.cleanup);
  const { prisma } = db;
  for (const id of ["owner-a", "owner-b"]) {
    await prisma.user.create({ data: { id, name: id, email: id + "@example.test", password: "synthetic", role: "OWNER" } });
    await prisma.property.create({ data: { id: "p-" + id, ownerId: id, name: "Synthetic", slug: id, address: "Synthetic", city: "Test", state: "SP", basePrice: 100 } });
    await prisma.reservation.create({ data: { id: "r-" + id, code: id.toUpperCase(), propertyId: "p-" + id, guestName: id, guestPhone: "synthetic-" + id,
      checkIn: new Date("2030-10-01"), checkOut: new Date("2030-10-03"), nights: 3, totalAmount: 100, cleaningFee: 0, commission: 10, ownerAmount: 90,
      status: "CONFIRMED", paymentStatus: id === "owner-a" ? "REVIEW" : "PAID", installmentData: JSON.stringify({ items: [{ seq: 1, label: "Entry", amount: 100, dueDate: "2030-01-01", paid: true }] }) } });
  }
  let user = { id: "owner-a", role: "OWNER" };
  const route = load("src/app/api/admin/installments/route.ts", { "@/lib/prisma": { prisma }, "@/lib/auth": { getAuthUser: async () => user } });
  const response = await route.GET(request("/api/admin/installments"));
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /private, no-store/);
  const { plans, summary } = await response.json();
  assert.equal(plans.length, 1); assert.equal(plans[0].reservationId, "r-owner-a");
  assert.equal(plans[0].paymentStatus, "REVIEW"); assert.equal(plans[0].stats.health, "review");
  assert.equal(summary.totalReview, 1); assert.equal(summary.totalPaidAmount, 0);
  user = { id: "admin", role: "ADMIN" };
  assert.equal((await (await route.GET(request("/api/admin/installments"))).json()).plans.length, 2);
  user = { id: "other", role: "CLEANER" };
  assert.equal((await route.GET(request("/api/admin/installments"))).status, 403);
  user = null; assert.equal((await route.GET(request("/api/admin/installments"))).status, 401);
});

function descendants(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
}
function textOf(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray(node.props.children).map(textOf).join(" ");
}
function uiHarness(file, api, user = { id: "admin", role: "ADMIN" }) {
  const hooks = [], effects = [], errors = [], successes = [];
  let index = 0, dirty = true, tree;
  const react = { ...React,
    useState(initial) { const i = index++; if (!hooks[i]) hooks[i] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[i].value, value => { hooks[i].value = typeof value === "function" ? value(hooks[i].value) : value; dirty = true; }]; },
    useEffect(fn, deps) { const i = index++; if (!hooks[i] || !deps || deps.some((value, j) => !Object.is(value, hooks[i].deps[j]))) { hooks[i] = { deps }; effects.push(fn); } },
  };
  const page = load(file, { react, "react/jsx-runtime": require("react/jsx-runtime"), "lucide-react": require("lucide-react"),
    "framer-motion": { motion: new Proxy({}, { get: () => "div" }) }, "next/link": "a",
    "next/navigation": { useParams: () => ({ id: "r-test" }), useRouter: () => ({ back() {} }) },
    "@/hooks/useAuth": { apiRequest: api, useAuthStore: () => ({ user }) },
    "@/hooks/useGuestAccess": { withGuestAccess: (url, token) => url + "?access_token=" + token },
    "@/lib/utils": { cn: (...args) => args.filter(value => typeof value === "string").join(" "), formatCurrency: value => "R$" + value, formatDate: String, formatDateTime: String, getStatusColor: () => "", getStatusLabel: String },
    "react-hot-toast": { error: message => errors.push(message), success: message => successes.push(message) },
  }, { confirm: () => true });
  async function flush() {
    for (let count = 0; count < 15; count++) {
      if (dirty) { dirty = false; index = 0; tree = page.default(); }
      while (effects.length) effects.shift()();
      await new Promise(resolve => setImmediate(resolve));
      if (!dirty && effects.length === 0) break;
    }
    return tree;
  }
  return { flush, errors, successes, nodes: () => descendants(tree) };
}

test("manual installment UI calls the protected admin action and reports an HTTP failure", async () => {
  const calls = [];
  let success = false;
  const entry = { reservationId: "r-test", code: "RTEST", reservationStatus: "CONFIRMED", paymentStatus: "PENDING", stats: { health: "ok" } };
  const h = uiHarness("src/app/(dashboard)/payments/page.tsx", async (url, options) => {
    calls.push({ url, options });
    if (!options) return { ok: true, json: async () => ({ plans: [entry], summary: null }) };
    return { ok: success, json: async () => success ? { ok: true } : { error: "Pagamento aguarda conferência" } };
  });
  await h.flush();
  const card = h.nodes().find(node => node.props.entry?.code === "RTEST");
  assert.equal(card.props.canMarkPaid, true);
  await card.props.onManualPay("RTEST", 1); await h.flush();
  assert.equal(calls[1].url, "/api/admin/installments/mark-paid");
  assert.deepEqual(JSON.parse(calls[1].options.body), { code: "RTEST", seq: 1, method: "Manual" });
  assert.deepEqual(h.errors, ["Pagamento aguarda conferência"]); assert.equal(h.successes.length, 0);
  success = true;
  await h.nodes().find(node => node.props.entry?.code === "RTEST").props.onManualPay("RTEST", 1); await h.flush();
  assert.equal(h.successes.length, 1); assert.equal(calls.length, 4);
});

test("reservation detail renders REVIEW and PARTIAL explicitly and blocks charging a review", async () => {
  for (const [paymentStatus, expected] of [["REVIEW", "Em conferência"], ["PARTIAL", "Parcialmente pago"]]) {
    const h = uiHarness("src/app/(dashboard)/reservations/[id]/page.tsx", async () => ({ ok: true, json: async () => ({ reservation: {
      id: "r-test", code: "RTEST", propertyId: "p1", guestName: "Synthetic", guestCount: 1, guests: [], status: "CONFIRMED", paymentStatus,
      checkIn: "2030-10-01T00:00:00Z", checkOut: "2030-10-03T00:00:00Z", nights: 3, totalAmount: 100, cleaningFee: 0, commission: 10, ownerAmount: 90,
      property: { id: "p1", name: "Test", address: "Test", city: "Test", state: "SP", owner: { id: "o", name: "Owner" } },
    } }) }));
    const tree = await h.flush();
    assert.match(textOf(tree), new RegExp(expected)); assert.doesNotMatch(textOf(tree), /Reembolsado/);
    if (paymentStatus === "REVIEW") assert.equal(h.nodes().find(node => node.type === "button" && textOf(node).includes("Gerar link de pagamento")).props.disabled, true);
  }
});

test("sending checkout reminder does not change reservation status or close guest access", async () => {
  const updates = []; let reads = 0;
  const row = { id: "r-test", code: "RTEST", guestName: "Synthetic", guestPhone: "000", checkOut: new Date(), property: { name: "Test", checkOutTime: "12:00" } };
  const route = load("src/app/api/cron/whatsapp/route.ts", {
    "@/lib/prisma": { prisma: { reservation: { findMany: async () => ++reads === 3 ? [row] : [], update: async data => { updates.push(data); } }, $queryRawUnsafe: async () => [] } },
    "@/lib/guest-access": { createGuestLink: () => "/synthetic?access_token=synthetic" }, "@/lib/cron-auth": { checkCronSecret: () => null },
  }, { process: { env: { WHATSAPP_API_URL: "https://synthetic.invalid", WHATSAPP_API_KEY: "synthetic", WHATSAPP_INSTANCE: "synthetic" } }, fetch: async () => ({ ok: true }) });
  assert.equal((await route.GET(request("/api/cron/whatsapp"))).status, 200);
  assert.equal(updates.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(updates[0].data)), { waMsgCheckout: true });
});
test("review resolution in the reservation UI requires an unchecked attestation and submits an explicit flag", async () => {
  const calls = [];
  const reservation = { id: "r-test", code: "RTEST", propertyId: "p1", guestName: "Synthetic", guestCount: 1, guests: [], status: "CONFIRMED", paymentStatus: "REVIEW",
    checkIn: "2030-10-01T00:00:00Z", checkOut: "2030-10-03T00:00:00Z", nights: 3, totalAmount: 100, cleaningFee: 0, commission: 10, ownerAmount: 90,
    property: { id: "p1", name: "Test", address: "Test", city: "Test", state: "SP", owner: { id: "o", name: "Owner" } } };
  const h = uiHarness("src/app/(dashboard)/reservations/[id]/page.tsx", async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ reservation: options?.method === "POST" ? { ...reservation, paymentStatus: "PAID" } : reservation }) };
  });
  await h.flush();
  h.nodes().find(node => node.type === "button" && textOf(node).includes("Conferir recebimento e resolver revisão")).props.onClick();
  await h.flush();
  const checkbox = h.nodes().find(node => node.type === "input" && node.props.type === "checkbox");
  assert.equal(checkbox.props.checked, false);
  const confirmButton = () => h.nodes().find(node => node.type === "button" && textOf(node).includes("Confirmar recebimento conferido"));
  assert.equal(confirmButton().props.disabled, true);
  await confirmButton().props.onClick(); assert.equal(calls.length, 1);
  h.nodes().find(node => node.type === "input" && node.props.placeholder === "Ex.: transferência bancária").props.onChange({ target: { value: "Transferência conferida" } });
  checkbox.props.onChange({ target: { checked: true } });
  await h.flush(); assert.equal(confirmButton().props.disabled, false);
  await confirmButton().props.onClick(); await h.flush();
  assert.equal(calls[1].url, "/api/reservations/r-test/confirm-payment");
  assert.deepEqual(JSON.parse(calls[1].options.body), { method: "Transferência conferida", resolveReview: true });
  assert.equal(h.successes.length, 1);
  assert.match(textOf(await h.flush()), /Pago/);
});