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
function createHarness({ response = { paymentStatus: "PAID" }, ok = true, networkError, gateway = "pagbank",
  initialStatus = "PENDING", bookingStatus = "CONFIRMED", returnStatus = "", pixExpiresIn = 600000,
  reservationFailures = [], pendingRead, installmentPlan,
} = {}) {
  let tree;
  let dirty = true;
  let hookIndex = 0;
  let reservationStatus = initialStatus;
  let now = new Date("2026-09-18T17:00:00Z").getTime();
  let reservationReads = 0;
  let plan = installmentPlan;
  const hooks = [];
  const effects = [];
  const calls = [];
  const timers = [];
  const FakeDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
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
      useSearchParams: () => new URLSearchParams(returnStatus ? `status=${returnStatus}` : ""),
    },
    "@/hooks/useGuestAccess": { useGuestAccess: () => ({ guestFetch: fetchMock, guestLink: path => `${path}?access_token=synthetic-token` }) },
  };
  const module = { exports: {} };
    async function fetchMock(url, options) {
      calls.push({ url, options });
      if (url === "/api/public/pagbank-config") {
        return { ok: true, json: async () => ({ publicKey: "synthetic-public-key", ...(gateway ? { cardGateway: gateway } : {}) }) };
      }
      if (url === "/api/public/reservation/UI-TEST") {
        reservationReads++;
        if (reservationFailures.includes(reservationReads)) return { ok: false, json: async () => ({ error: "Falha simulada ao consultar pagamento" }) };
        if (pendingRead === reservationReads) return new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("Aborted test read")), { once: true });
        });
        return { ok: true, json: async () => ({ reservation: {
          code: "UI-TEST", guestName: "Teste", guestCount: 2,
          checkIn: "2030-10-01T12:00:00Z", checkOut: "2030-10-03T12:00:00Z",
          nights: 3, totalAmount: 600, cleaningFee: 0,
          paymentStatus: reservationStatus, status: bookingStatus, installmentPlan: plan,
          property: { name: "Imóvel simulado", city: "Teste", state: "SP" },
        } }) };
      }
      if (url === "/api/public/payments/pagbank-pix" || (url === "/api/public/payments/pay-installment" && JSON.parse(options.body).method === "pix")) {
        return { ok: true, json: async () => ({ chargeId: "SYNTHETIC-PIX", pixText: "synthetic-pix-not-payable", expiresAt: new Date(now + pixExpiresIn).toISOString(), pixExpiresAt: new Date(now + pixExpiresIn).toISOString() }) };
      }
      assert.equal(url, "/api/public/payments/pagbank-card", "Only mocked checkout endpoints are allowed");
      assert.equal(options.method, "POST");
      if (networkError) throw new Error("Synthetic network failure");
      return { ok, json: async () => response };
    }
  const context = vm.createContext({
    module,
    exports: module.exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
    fetch: fetchMock,
    setTimeout(callback, delay) { timers.push({ callback, delay, at: now + delay, active: true }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].active = false; },
    Date: FakeDate,
    AbortController,
    AbortSignal,
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
    activeTimers: () => timers.filter(timer => timer.active),
    reservationReads: () => reservationReads,
    async advance(milliseconds) {
      const until = now + milliseconds;
      for (let safety = 0; safety < 100; safety++) {
        const next = timers.filter(timer => timer.active && timer.at <= until).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at;
        next.active = false;
        // Do not await network; abort timeouts must be able to interrupt it.
        next.callback();
        await flush();
      }
      now = until;
      await flush();
    },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
    text: () => textOf(tree),
    nodes: () => descendants(tree),
    setReservationStatus(status) { reservationStatus = status; },
    setInstallmentPaid(seq) { plan = { ...plan, items: plan.items.map(item => item.seq === seq ? { ...item, paid: true, paidAt: new Date(now).toISOString() } : item) }; },
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
    async generatePix() {
      await flush();
      const cpfInput = descendants(tree).find(node => node.type === "input" && node.props.placeholder === "000.000.000-00");
      assert.ok(cpfInput, "PIX must ask for the payer CPF");
      cpfInput.props.onChange({ target: { value: "00000000000" } });
      await flush();
      const generate = descendants(tree).find(node => node.type === "button" && textOf(node).includes("Gerar PIX de"));
      assert.ok(generate, "PIX generation button should be rendered");
      assert.equal(generate.props.disabled, false);
      await generate.props.onClick();
      await flush();
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
    assert.equal(harness.activeTimers().length, 0);
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
  assert.equal(harness.activeTimers().length, 1);
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
  assert.equal(harness.activeTimers().length, 0);
});

test("network failure is caught and never displays approval", async () => {
  const harness = createHarness({ networkError: true });
  await harness.submit();
  assert.ok(harness.text().includes("Falha de conexão ao processar o cartão"));
  assert.equal(harness.text().includes("Pagamento aprovado!"), false);
  assert.equal(harness.activeTimers().length, 0);
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

test("ordinary PIX polls without return parameters and stops once paid", async () => {
  const harness = createHarness();
  await harness.generatePix();
  assert.ok(harness.text().includes("Acompanhando a confirmação do PIX"));
  assert.equal(harness.reservationReads(), 1);
  assert.equal(harness.activeTimers().length, 1);
  harness.setReservationStatus("PAID");
  await harness.advance(10000);
  assert.ok(harness.text().includes("Reserva Confirmada!"));
  assert.equal(harness.reservationReads(), 2);
  assert.equal(harness.activeTimers().length, 0);
  await harness.advance(60000);
  assert.equal(harness.reservationReads(), 2);
});

test("PIX expiry removes the expired code after a final status read and stops polling", async () => {
  const harness = createHarness({ pixExpiresIn: 15000 });
  await harness.generatePix();
  await harness.advance(15000);
  assert.ok(harness.text().includes("Este PIX expirou"));
  assert.equal(harness.reservationReads(), 3);
  assert.equal(harness.nodes().some(node => typeof node.type === "function" && node.type.name === "PixDisplay"), false);
  assert.equal(harness.activeTimers().length, 0);
});

test("PIX polling reports errors, pauses after three failures and supports manual recovery", async () => {
  const harness = createHarness({ reservationFailures: [2, 3, 4] });
  await harness.generatePix();
  await harness.advance(10000);
  assert.ok(harness.text().includes("Falha ao consultar o pagamento"));
  await harness.advance(60000);
  assert.ok(harness.text().includes("acompanhamento foi pausado"));
  assert.equal(harness.activeTimers().length, 0);
  assert.equal(harness.text().includes("Reserva Confirmada!"), false);
  harness.setReservationStatus("PAID");
  await harness.button("Verificar pagamento agora").props.onClick();
  await harness.flush();
  assert.ok(harness.text().includes("Reserva Confirmada!"));
  assert.equal(harness.activeTimers().length, 0);
});

test("polling aborts a stalled status read after eight seconds without overlapping requests", async () => {
  const harness = createHarness({ pendingRead: 2 });
  await harness.generatePix();
  await harness.advance(10000);
  assert.equal(harness.reservationReads(), 2);
  const read = harness.calls.filter(call => call.url === "/api/public/reservation/UI-TEST").at(-1);
  assert.equal(read.options.signal.aborted, false);
  await harness.advance(8000);
  assert.equal(read.options.signal.aborted, true);
  assert.equal(harness.reservationReads(), 2);
  assert.ok(harness.text().includes("Falha ao consultar o pagamento"));
  await harness.advance(20000);
  assert.equal(harness.reservationReads(), 3);
  harness.unmount();
  assert.equal(harness.activeTimers().length, 0);
});

test("unmount aborts an in-flight PIX status read and clears all scheduled polls", async () => {
  const harness = createHarness({ pendingRead: 2 });
  await harness.generatePix();
  await harness.advance(10000);
  const read = harness.calls.filter(call => call.url === "/api/public/reservation/UI-TEST").at(-1);
  harness.unmount();
  await new Promise(setImmediate);
  assert.equal(read.options.signal.aborted, true);
  assert.equal(harness.activeTimers().length, 0);
});

test("a gateway return keeps checking after the old eight-second cutoff", async () => {
  const harness = createHarness({ returnStatus: "pending" });
  await harness.flush();
  await harness.advance(20000);
  assert.equal(harness.reservationReads(), 3);
  harness.setReservationStatus("PAID");
  await harness.advance(10000);
  assert.ok(harness.text().includes("Reserva Confirmada!"));
  assert.equal(harness.activeTimers().length, 0);
});

for (const state of [{ initialStatus: "REVIEW" }, { bookingStatus: "PAYMENT_REVIEW" }]) {
  test(`reviewed reservation blocks payment controls: ${JSON.stringify(state)}`, async () => {
    const harness = createHarness(state);
    await harness.flush();
    assert.ok(harness.text().includes("Seu pagamento precisa de conferência"));
    assert.ok(harness.text().includes("Não faça outro pagamento"));
    assert.equal(harness.cardForm(), undefined);
    assert.equal(harness.nodes().some(node => node.type === "button" && /Gerar PIX|Cartão de Crédito|Parcelado/.test(textOf(node))), false);
    assert.equal(harness.activeTimers().length, 0);
  });
}

test("REVIEW received after submission cannot be mistaken for approval or retried", async () => {
  const harness = createHarness({ response: { paymentStatus: "REVIEW", review: true } });
  const oldForm = await harness.submit();
  assert.ok(harness.text().includes("Seu pagamento precisa de conferência"));
  assert.equal(harness.text().includes("Pagamento aprovado!"), false);
  await oldForm.props.onSuccess(cardData);
  assert.equal(harness.paymentCalls().length, 1);
  assert.equal(harness.activeTimers().length, 0);
});

test("PIX polling stops and blocks payment when the reservation needs manual review", async () => {
  const harness = createHarness();
  await harness.generatePix();
  harness.setReservationStatus("REVIEW");
  await harness.advance(10000);
  assert.ok(harness.text().includes("Seu pagamento precisa de conferência"));
  assert.equal(harness.activeTimers().length, 0);
  assert.equal(harness.nodes().some(node => typeof node.type === "function" && node.type.name === "PixDisplay"), false);
});

test("installment PIX stops once its installment is paid, even while balance remains", async () => {
  const plan = { numInstallments: 1, entryAmount: 180, installmentAmount: 420, deadline: "2026-10-18", createdAt: "2026-09-18", items: [
    { seq: 1, label: "Entrada", amount: 180, dueDate: "2026-09-18", paid: false },
    { seq: 2, label: "Saldo", amount: 420, dueDate: "2026-10-18", paid: false },
  ] };
  const harness = createHarness({ installmentPlan: plan });
  await harness.flush();
  const pixButton = harness.nodes().find(node => node.type === "button" && /PIX/.test(textOf(node)));
  assert.ok(pixButton);
  await pixButton.props.onClick();
  await harness.flush();
  await harness.generatePix();
  const payment = harness.calls.find(call => call.url === "/api/public/payments/pay-installment");
  assert.equal(JSON.parse(payment.options.body).cpf, "000.000.000-00");
  harness.setInstallmentPaid(1);
  harness.setReservationStatus("PARTIAL");
  await harness.advance(10000);
  assert.ok(harness.text().includes("Pago Parcialmente"));
  assert.ok(harness.text().includes("Pagamento da parcela confirmado"));
  assert.equal(harness.activeTimers().length, 0);
  assert.equal(harness.nodes().some(node => typeof node.type === "function" && node.type.name === "PixDisplay"), false);
});

test("initial load times out visibly and can be retried without losing the page", async () => {
  const harness = createHarness({ pendingRead: 1 });
  await harness.flush();
  await harness.advance(10000);
  assert.ok(harness.text().includes("A consulta demorou demais"));
  await harness.button("Tentar carregar novamente").props.onClick();
  await harness.flush();
  assert.ok(harness.text().includes("Pagamento da Reserva"));
  assert.equal(harness.text().includes("A consulta demorou demais"), false);
});

test("a review can only release controls after a successful status read reports resolution", async () => {
  const harness = createHarness({ response: { paymentStatus: "REVIEW" } });
  await harness.submit();
  harness.setReservationStatus("FAILED");
  await harness.button("Verificar status").props.onClick();
  await harness.flush();
  assert.equal(harness.text().includes("Seu pagamento precisa de conferência"), false);
  assert.ok(harness.cardForm());
  await harness.cardForm().props.onSuccess(cardData);
  assert.equal(harness.paymentCalls().length, 2);
});
