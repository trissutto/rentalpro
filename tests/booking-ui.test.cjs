const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const ts = require("typescript");

const project = path.resolve(__dirname, "..");
const propertyPath = "src/app/(guest)/imoveis/[slug]/page.tsx";
const calendarPath = "src/components/DateRangePicker.tsx";
const compiled = new Map();
function source(file) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(path.join(project, file), "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText);
  return compiled.get(file);
}
function nodes(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(nodes)];
}
function text(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray(node.props.children).map(text).join(" ");
}

function renderHarness(file, imports = {}, globals = {}, initialProps = {}) {
  let index = 0, tree, dirty = true, props = initialProps;
  const hooks = [], effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    ...React,
    useState(initial) {
      const key = index++;
      if (!hooks[key]) hooks[key] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[key].value, next => {
        const value = typeof next === "function" ? next(hooks[key].value) : next;
        if (!Object.is(value, hooks[key].value)) { hooks[key].value = value; dirty = true; }
      }];
    },
    useRef(initial) { const key = index++; return hooks[key] || (hooks[key] = { current: initial }); },
    useId() { return `test-dialog-${index++}`; },
    useCallback(callback, deps) {
      const key = index++;
      if (!hooks[key] || !same(hooks[key].deps, deps)) hooks[key] = { value: callback, deps };
      return hooks[key].value;
    },
    useEffect(effect, deps) {
      const key = index++;
      if (!hooks[key] || !same(hooks[key].deps, deps)) {
        const previous = hooks[key];
        hooks[key] = { deps };
        effects.push(() => { previous?.cleanup?.(); hooks[key].cleanup = effect(); });
      }
    },
  };
  const module = { exports: {} };
  const allowed = { react, "react/jsx-runtime": require("react/jsx-runtime"), "lucide-react": require("lucide-react"), ...imports };
  new vm.Script(source(file), { filename: file }).runInNewContext({
    module, exports: module.exports, console, URLSearchParams, AbortController, AbortSignal, Date, Set,
    require(name) { assert.ok(Object.hasOwn(allowed, name), `Unexpected import ${name}`); return allowed[name]; },
    ...globals,
  });
  return {
    nodes: () => nodes(tree), text: () => text(tree),
    update(next) { props = { ...props, ...next }; dirty = true; },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
    async flush() {
      for (let turn = 0; turn < 30; turn++) {
        if (dirty) {
          dirty = false; index = 0;
          tree = module.exports.default(props);
          globals.commit?.(tree);
        }
        effects.splice(0).forEach(effect => effect());
        await new Promise(setImmediate);
        if (!dirty && !effects.length) return;
      }
      throw new Error("Component did not settle");
    },
  };
}

const fixtureProperty = {
  id: "p1", name: "Imóvel de teste", slug: "house", address: "Endereço simulado", city: "Teste", state: "SP",
  basePrice: 100, cleaningFee: 30, capacity: 4, bedrooms: 2, bathrooms: 1, photos: "[]", amenities: "[]", maxGuests: 4,
};
function quote(totalAmount = 330) {
  return { totalAmount, accommodationTotal: totalAmount - 30, cleaningFee: 30, extraGuestTotal: 0, diarias: 3, nightCount: 2,
    groups: [{ label: "Diária", count: 3, unitPrice: (totalAmount - 30) / 3, subtotal: totalAmount - 30 }] };
}

function propertyHarness({ failAvailability = false, deferQuotes = false, priceChanged = false } = {}) {
  const calls = [], messages = [], waiting = [], timers = [];
  let availabilityFailed = failAvailability, serverQuote = quote(), changed = priceChanged;
  const imports = {
    "framer-motion": { motion: new Proxy({}, { get: (_target, tag) => tag }) },
    "next/navigation": { useParams: () => ({ slug: "house" }), useSearchParams: () => new URLSearchParams("checkIn=2027-01-08&checkOut=2027-01-10&guests=2"), useRouter: () => ({ back() {}, push() {} }) },
    "@/lib/utils": { formatCurrency: value => `R$ ${value}`, formatDate: String },
    "@/hooks/useGuestAccess": { withGuestAccess: (path, token) => `${path}?access_token=${token}` },
    "react-hot-toast": { __esModule: true, default: { error: message => messages.push(message), success: message => messages.push(message) } },
  };
  const h = renderHarness(propertyPath, imports, {
    setTimeout(fn, delay) { timers.push({ fn, delay, active: true }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].active = false; },
    async fetch(url, options) {
      calls.push({ url, options });
      if (url === "/api/public/properties/house") return { ok: true, json: async () => ({ property: fixtureProperty }) };
      if (url.startsWith("/api/public/availability?")) return {
        ok: !availabilityFailed, json: async () => availabilityFailed ? { error: "Synthetic failure" }
          : { occupiedDates: ["2027-01-20"], minNightsRules: [], rangeStart: "2026-09-01", rangeEnd: "2028-09-30" },
      };
      if (url.startsWith("/api/public/pricing-preview?")) {
        if (deferQuotes) return new Promise(resolve => waiting.push({ url, signal: options.signal, resolve: value => resolve({ ok: true, json: async () => ({ quote: value }) }) }));
        return { ok: true, json: async () => ({ quote: serverQuote }) };
      }
      assert.equal(url, "/api/public/reservation", "Only synthetic booking requests allowed");
      return changed ? { ok: false, json: async () => ({ code: "PRICE_CHANGED", error: "A cotação mudou" }) }
        : { ok: true, json: async () => ({ reservation: { code: "RTEST", accessToken: "synthetic-token" } }) };
    },
  });
  return {
    ...h, calls, waiting, messages,
    setAvailabilityFailure(value) { availabilityFailed = value; },
    setServerQuote(value) { serverQuote = value; },
    setPriceChanged(value) { changed = value; },
    calendar: () => h.nodes().find(node => typeof node.type === "function" && node.type.name === "AvailabilityCalendar"),
    submitButton: () => h.nodes().find(node => node.type === "button" && node.props.type === "submit"),
    async submit() {
      const form = h.nodes().find(node => node.type === "form");
      assert.ok(form);
      await form.props.onSubmit({ preventDefault() {} });
      await h.flush();
    },
    bookings: () => calls.filter(call => call.url === "/api/public/reservation"),
    async changeGuests(count) {
      const button = h.nodes().find(node => node.type === "button" && text(node) === String(count));
      assert.ok(button);
      button.props.onClick();
      await h.flush();
    },
  };
}

test("availability HTTP 500 hides the calendar and prevents booking; retry restores real occupied dates", async () => {
  const h = propertyHarness({ failAvailability: true });
  await h.flush();
  assert.ok(h.text().includes("Não foi possível consultar as datas"));
  assert.equal(h.calendar(), undefined);
  assert.equal(h.submitButton().props.disabled, true);
  await h.submit();
  assert.equal(h.bookings().length, 0);
  h.setAvailabilityFailure(false);
  h.nodes().find(node => node.type === "button" && text(node) === "Tentar novamente").props.onClick();
  await h.flush();
  assert.ok(h.calendar());
  assert.equal(h.calendar().props.occupiedDates.has("2027-01-20"), true);
  assert.equal(h.submitButton().props.disabled, false);
  h.unmount();
});

test("changing guests invalidates the previous quote until the matching server response arrives", async () => {
  const h = propertyHarness({ deferQuotes: true });
  await h.flush();
  h.waiting[0].resolve(quote(330));
  await h.flush();
  assert.equal(h.submitButton().props.disabled, false);
  await h.changeGuests(3);
  assert.equal(h.submitButton().props.disabled, true);
  await h.submit();
  assert.equal(h.bookings().length, 0);
  h.waiting[1].resolve(quote(390));
  await h.flush();
  await h.submit();
  const payload = JSON.parse(h.bookings()[0].options.body);
  assert.equal(payload.guestCount, 3);
  assert.equal(payload.expectedTotal, 390);
  assert.ok(h.nodes().some(node => node.type === "a" && node.props.href === "/pagar/RTEST?access_token=synthetic-token"));
  h.unmount();
});

test("an old quote arriving after a newer guest selection cannot authorize a booking", async () => {
  const h = propertyHarness({ deferQuotes: true });
  await h.flush();
  await h.changeGuests(3);
  assert.equal(h.waiting[0].signal.aborted, true);
  h.waiting[0].resolve(quote(330));
  await h.flush();
  assert.equal(h.submitButton().props.disabled, true);
  await h.submit();
  assert.equal(h.bookings().length, 0);
  h.waiting[1].resolve(quote(390));
  await h.flush();
  assert.equal(h.submitButton().props.disabled, false);
  h.unmount();
});

test("booking sends the displayed server quote and PRICE_CHANGED requires refreshed confirmation", async () => {
  const h = propertyHarness({ priceChanged: true, deferQuotes: true });
  await h.flush();
  h.waiting[0].resolve(quote(330));
  await h.flush();
  await h.submit();
  assert.equal(JSON.parse(h.bookings()[0].options.body).expectedTotal, 330);
  assert.ok(h.messages.includes("A cotação mudou"));
  assert.equal(h.submitButton().props.disabled, true);
  await h.submit();
  assert.equal(h.bookings().length, 1);
  h.waiting[1].resolve(quote(450));
  await h.flush();
  h.setPriceChanged(false);
  await h.submit();
  assert.equal(JSON.parse(h.bookings()[1].options.body).expectedTotal, 450);
  h.unmount();
});

test("selected dates beyond the loaded calendar coverage cannot be submitted", async () => {
  const h = propertyHarness();
  await h.flush();
  h.calendar().props.onSelectCheckOut("2029-01-10");
  await h.flush();
  assert.equal(h.submitButton().props.disabled, true);
  await h.submit();
  assert.equal(h.bookings().length, 0);
  h.unmount();
});

function calendarHarness() {
  const listeners = new Map(), domByKey = new Map(), timerQueue = [];
  const doc = { activeElement: null, body: { style: { overflow: "auto" } },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } };
  let renderedRoot;
  class Element {
    constructor() { this.children = []; }
    focus() { doc.activeElement = this; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    getClientRects() { return this.hidden ? [] : [{}]; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const all = this.children.flatMap(child => [child, ...child.querySelectorAll("*")]);
      if (selector === "*") return all;
      if (selector === "button[data-date]") return all.filter(node => node.tag === "button" && node.props["data-date"]);
      if (selector === "button:not(:disabled)") return all.filter(node => node.tag === "button" && !node.disabled);
      return all.filter(node => (node.tag === "button" && !node.disabled) || node.props.href || node.tag === "input" || node.props.tabIndex === 0);
    }
  }
  function commit(tree) {
    function build(node, key) {
      if (!React.isValidElement(node)) return [];
      const children = React.Children.toArray(node.props.children).flatMap((child, i) => build(child, `${key}.${i}`));
      if (typeof node.type !== "string") return children;
      const stable = node.props["data-date"] || `${key}:${node.type}`;
      const el = domByKey.get(stable) || new Element();
      domByKey.set(stable, el);
      el.tag = node.type; el.props = node.props; el.children = children; el.disabled = Boolean(node.props.disabled);
      el.hidden = Boolean(node.props.className?.includes("sm:invisible"));
      if (node.ref) node.ref.current = el;
      return [el];
    }
    renderedRoot = build(tree, "root")[0];
  }
  const FakeDate = class extends Date { constructor(...args) { super(...(args.length ? args : ["2026-09-18T12:00:00Z"])); } };
  let h;
  h = renderHarness(calendarPath, { "react-dom": { createPortal: children => children } }, {
    Date: FakeDate, document: doc, getComputedStyle: node => ({ visibility: node.hidden ? "hidden" : "visible" }), commit,
    setTimeout(fn) { timerQueue.push(fn); return timerQueue.length; }, clearTimeout() {},
  }, { checkIn: "", checkOut: "", onChangeCheckIn: value => h.update({ checkIn: value }), onChangeCheckOut: value => h.update({ checkOut: value }) });
  const buttonByLabel = label => renderedRoot.querySelectorAll("*").find(el => el.tag === "button" && el.props["aria-label"] === label);
  return { ...h, doc, listeners, timerQueue,
    dialog: () => renderedRoot.querySelectorAll("*").find(el => el.props.role === "dialog"),
    buttonByLabel,
    date: value => domByKey.get(value),
    opener: () => renderedRoot.querySelectorAll("*").find(el => el.props["aria-haspopup"] === "dialog"),
    async open() { await h.flush(); const opener = this.opener(); opener.focus(); opener.props.onClick(); await h.flush(); },
    key(key, shiftKey = false) { const event = { key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } }; listeners.get("keydown")?.(event); return event; },
  };
}

test("date picker has an accessible modal, initial focus, Escape dismissal and restored focus", async () => {
  const h = calendarHarness();
  await h.open();
  const panel = h.dialog();
  assert.equal(String(panel.props["aria-modal"]), "true");
  assert.equal(panel.props["aria-label"], "Selecionar datas da hospedagem");
  assert.equal(h.opener().props["aria-controls"], panel.props.id);
  assert.equal(h.opener().props["aria-expanded"], true);
  assert.equal(h.doc.activeElement, h.buttonByLabel("Fechar calendário"));
  assert.equal(h.doc.body.style.overflow, "hidden");
  assert.equal(h.key("Escape").prevented, true);
  await h.flush();
  assert.ok(!h.dialog(), "Escape must close the dialog");
  assert.equal(h.doc.activeElement, h.opener());
  assert.equal(h.doc.body.style.overflow, "auto");
  assert.equal(h.listeners.has("keydown"), false);
});

test("date picker traps Tab and Shift+Tab among visible, enabled controls", async () => {
  const h = calendarHarness();
  await h.open();
  const controls = h.dialog().querySelectorAll("button:not(:disabled), [href], input, [tabindex='0']").filter(el => !el.hidden);
  const first = controls[0], last = controls.at(-1);
  last.focus(); assert.equal(h.key("Tab").prevented, true); assert.equal(h.doc.activeElement, first);
  first.focus(); assert.equal(h.key("Tab", true).prevented, true); assert.equal(h.doc.activeElement, last);
  h.opener().focus(); assert.equal(h.key("Tab").prevented, true); assert.equal(h.doc.activeElement, first);
  assert.equal(controls.some(el => el.disabled), false);
  h.unmount();
});

test("date labels announce complete dates and arrow keys move by day and week", async () => {
  const h = calendarHarness();
  await h.open();
  const start = h.date("2026-09-25");
  assert.match(start.props["aria-label"], /25 de setembro de 2026/);
  assert.equal(h.date("2026-09-17").disabled, true);
  assert.ok(h.buttonByLabel("Mês anterior"));
  assert.ok(h.buttonByLabel("Próximo mês"));
  start.focus();
  const event = key => ({ key, currentTarget: start, preventDefault() {} });
  start.props.onKeyDown(event("ArrowRight")); assert.equal(h.doc.activeElement, h.date("2026-09-26"));
  start.props.onKeyDown(event("ArrowLeft")); assert.equal(h.doc.activeElement, h.date("2026-09-24"));
  start.props.onKeyDown(event("ArrowDown")); assert.equal(h.doc.activeElement, h.date("2026-10-02"));
  start.props.onKeyDown(event("ArrowUp")); assert.equal(h.doc.activeElement, h.date("2026-09-18"));
  h.unmount();
});

test("choosing the date range closes the modal and returns focus without leaving a delayed close", async () => {
  const h = calendarHarness();
  await h.open();
  h.date("2026-09-25").props.onClick(); await h.flush();
  assert.equal(h.date("2026-09-25").props["aria-pressed"], true);
  h.date("2026-09-27").props.onClick(); await h.flush();
  assert.ok(!h.dialog(), "Selecting the range must close the dialog");
  assert.equal(h.doc.activeElement, h.opener());
  assert.equal(h.timerQueue.length, 0);
});

test("a date-selection callback cannot close a newly reopened calendar", async () => {
  const h = calendarHarness();
  await h.open();
  h.date("2026-09-25").props.onClick(); await h.flush();
  h.date("2026-09-27").props.onClick(); await h.flush();
  if (h.dialog()) { h.key("Escape"); await h.flush(); }
  await h.open();
  h.timerQueue.forEach(callback => callback());
  await h.flush();
  assert.ok(h.dialog(), "An earlier range selection must not close the newly opened modal");
  h.unmount();
});
