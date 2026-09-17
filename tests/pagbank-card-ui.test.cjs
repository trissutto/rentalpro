const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const React = require("react");
const ts = require("typescript");

const pagePath = "src/app/(guest)/pagar/[code]/page.tsx";
const compiled = ts.transpileModule(
  readFileSync(path.resolve(__dirname, "..", pagePath), "utf8"),
  {
    fileName: pagePath,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }
);
assert.equal(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);

const cardData = {
  encryptedCard: "synthetic-encrypted-card-not-a-real-payment",
  holderName: "Teste UI",
  holderCpf: "00000000000",
  installments: 6,
};

function descendants(node) {
  if (!React.isValidElement(node)) return [];
  return [node, ...React.Children.toArray(node.props.children).flatMap(descendants)];
}

function textOf(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement(node)) return "";
  return React.Children.toArray(node.props.children).map(textOf).join(" ");
}

// Stateful hooks drive the real page and its rendered callbacks. Fetch is fully
// replaced; no SDK, database, environment file or payment gateway is available.
function createHarness({ response = { paymentStatus: "PAID" }, ok = true, networkError, gateway = "pagbank" } = {}) {
  let tree;
  let dirty = true;
  let hookIndex = 0;
  let reservationStatus = "PENDING";
  const hooks = [];
  const effects = [];
  const calls = [];
  const timers = [];
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    ...React,
    useState(initial) {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, next => {
        const value = typeof next === "function" ? next(hooks[index].value) : next;
        if (!Object.is(value, hooks[index].value)) {
          hooks[index].value = value;
          dirty = true;
        }
      }];
    },
    useRef(initial) {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { current: initial };
      return hooks[index];
    },
    useCallback(callback, deps) {
      const index = hookIndex++;
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) hooks[index] = { value: callback, deps };
      return hooks[index].value;
    },
    useEffect(callback, deps) {
      const index = hookIndex++;
      if (!hooks[index] || !sameDeps(hooks[index].deps, deps)) {
        const previous = hooks[index];
        hooks[index] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index].cleanup = callback();
        });
      }
    },
  };
  const imports = {
    react,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "lucide-react": require("lucide-react"),
    "next/navigation": {
      useParams: () => ({ code: "UI-TEST" }),
      useSearchParams: () => new URLSearchParams(),
    },
  };
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
    async fetch(url, options) {
      calls.push({ url, options });
      if (url === "/api/public/pagbank-config") {
        return { ok: true, json: async () => ({ publicKey: "synthetic-public-key", ...(gateway ? { cardGateway: gateway } : {}) }) };
      }
      if (url === "/api/public/reservation/UI-TEST") {
        return { ok: true, json: async () => ({ reservation: {
          code: "UI-TEST", guestName: "Teste", guestCount: 2,
          checkIn: "2030-10-01T12:00:00Z", checkOut: "2030-10-03T12:00:00Z",
          nights: 3, totalAmount: 600, cleaningFee: 0,
          paymentStatus: reservationStatus,
          property: { name: "Imóvel simulado", city: "Teste", state: "SP" },
        } }) };
      }
      assert.equal(url, "/api/public/payments/pagbank-card", "Only mocked checkout endpoints are allowed");
      assert.equal(options.method, "POST");
      if (networkError) throw new Error("Synthetic network failure");
      return { ok, json: async () => response };
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
    console,
    URLSearchParams,
  });
  new vm.Script(compiled.outputText, { filename: pagePath }).runInContext(context);

  async function flush() {
    for (let count = 0; count < 20; count++) {
      if (dirty) {
        dirty = false;
        hookIndex = 0;
        tree = module.exports.default();
      }
      effects.splice(0).forEach(effect => effect());
      await new Promise(setImmediate);
      if (!dirty && effects.length === 0) return;
    }
    throw new Error("Page did not settle");
  }

  function button(label) {
    const found = descendants(tree).find(node => node.type === "button" && textOf(node).trim() === label);
    assert.ok(found, `Button not found: ${label}`);
    return found;
  }

  function cardForm() {
    return descendants(tree).find(node => typeof node.type === "function" && node.type.name === "CardForm");
  }

  return {
    calls, timers, flush, button, cardForm,
    text: () => textOf(tree),
    nodes: () => descendants(tree),
    setReservationStatus(status) { reservationStatus = status; },
    paymentCalls: () => calls.filter(call => call.url === "/api/public/payments/pagbank-card"),
    async openCard() {
      await flush();
      button("Cartão de Crédito").props.onClick();
      await flush();
      return cardForm();
    },
    async submit() {
      const form = await this.openCard();
      assert.ok(form, "PagBank card form should be rendered");
      await form.props.onSuccess(cardData);
      await flush();
      return form;
    },
  };
}

for (const response of [
  { paymentStatus: "FAILED", error: "Recusado pela operadora" },
  { paymentStatus: "FAILED" },
  { paymentStatus: "PAID", error: "Erro informado no corpo" },
]) {
  test(`HTTP 200 with ${JSON.stringify(response)} never approves payment`, async () => {
    const harness = createHarness({ response });
    await harness.submit();
    assert.ok(harness.cardForm());
    assert.equal(harness.text().includes("Pagamento aprovado!"), false);
    assert.equal(harness.timers.length, 0);
    assert.equal(harness.paymentCalls().length, 1);
  });
}

test("HTTP error never approves payment even with a PAID body", async () => {
  const harness = createHarness({ ok: false, response: { paymentStatus: "PAID", error: "Falha simulada" } });
  await harness.submit();
  assert.ok(harness.text().includes("Falha simulada"));
  assert.equal(harness.text().includes("Pagamento aprovado!"), false);
});

test("PAID shows approval and locks repeated submission", async () => {
  const harness = createHarness();
  const form = await harness.submit();
  assert.ok(harness.text().includes("Pagamento aprovado!"));
  assert.equal(harness.cardForm(), undefined);
  assert.equal(harness.timers.length, 1);
  await form.props.onSuccess(cardData);
  assert.equal(harness.paymentCalls().length, 1);
});

test("PENDING shows analysis, hides payment controls and locks repeated submission", async () => {
  const harness = createHarness({ response: { paymentStatus: "PENDING", message: "Pagamento processado" } });
  const form = await harness.submit();
  assert.ok(harness.text().includes("Pagamento em análise"));
  assert.equal(harness.text().includes("Pagamento aprovado!"), false);
  assert.equal(harness.cardForm(), undefined);
  assert.equal(harness.nodes().some(node => node.type === "button" && ["PIX", "Parcelado"].includes(textOf(node).trim())), false);
  assert.ok(harness.nodes().some(node => node.props.role === "status" && node.props.className.includes("bg-amber-50")));
  await form.props.onSuccess(cardData);
  assert.equal(harness.paymentCalls().length, 1);
});

test("checking a pending payment that becomes FAILED releases the form for retry", async () => {
  const harness = createHarness({ response: { paymentStatus: "PENDING" } });
  await harness.submit();
  harness.setReservationStatus("FAILED");
  harness.button("Verificar status").props.onClick();
  await harness.flush();
  assert.ok(harness.text().includes("Pagamento recusado. Você pode tentar novamente."));
  assert.equal(harness.text().includes("Pagamento em análise"), false);
  assert.ok(harness.cardForm());
  await harness.cardForm().props.onSuccess(cardData);
  assert.equal(harness.paymentCalls().length, 2);
});

test("checking a pending payment that becomes PAID displays the confirmed reservation", async () => {
  const harness = createHarness({ response: { paymentStatus: "PENDING" } });
  await harness.submit();
  harness.setReservationStatus("PAID");
  harness.button("Verificar status").props.onClick();
  await harness.flush();
  assert.ok(harness.text().includes("Reserva Confirmada!"));
  assert.equal(harness.text().includes("Pagamento em análise"), false);
  assert.equal(harness.cardForm(), undefined);
  assert.equal(harness.paymentCalls().length, 1);
});

test("unknown payment status reports uncertainty without approval", async () => {
  const harness = createHarness({ response: { paymentStatus: "UNKNOWN" } });
  await harness.submit();
  assert.ok(harness.text().includes("Não foi possível confirmar o resultado do pagamento"));
  assert.equal(harness.text().includes("Pagamento aprovado!"), false);
  assert.equal(harness.timers.length, 0);
});

test("network failure is caught and never displays approval", async () => {
  const harness = createHarness({ networkError: true });
  await harness.submit();
  assert.ok(harness.text().includes("Falha de conexão ao processar o cartão"));
  assert.equal(harness.text().includes("Pagamento aprovado!"), false);
  assert.equal(harness.timers.length, 0);
});

test("PagBank integral card offers six installments", async () => {
  const harness = createHarness();
  const form = await harness.openCard();
  assert.equal(form.props.maxInstallments, 6);
});

test("missing cardGateway preserves the Pagar.me checkout", async () => {
  const harness = createHarness({ gateway: null });
  await harness.openCard();
  assert.equal(harness.cardForm(), undefined);
  assert.ok(harness.text().includes("ambiente seguro do Pagar.me"));
  assert.equal(harness.paymentCalls().length, 0);
});
