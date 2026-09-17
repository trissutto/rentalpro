const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const { NextResponse } = require("next/server");

const projectRoot = path.resolve(__dirname, "..");
const routePath = "src/app/api/public/pagbank-config/route.ts";
const pagbankPath = "src/lib/pagbank.ts";
const gatewayUrl = "https://api.pagseguro.com/public-keys/card";
const fakeToken = "synthetic-test-token-never-a-real-credential";
const fakePublicKey = "synthetic-public-key-for-checkout-tests";

function compile(relativePath) {
  return ts.transpileModule(
    readFileSync(path.join(projectRoot, relativePath), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: relativePath,
    }
  ).outputText;
}

const compiledRoute = compile(routePath);
const compiledPagbank = compile(pagbankPath);

// Each test gets a fresh module, in-memory settings and a fetch replacement.
// No database client, environment file or real network is available to the route.
function createHarness({ settings = {}, settingsError, gatewayResponse, networkError, cacheError } = {}) {
  const fetchCalls = [];
  const writes = [];
  const errors = [];
  const prisma = {
    setting: {
      async findMany({ where }) {
        if (settingsError) throw settingsError;
        return where.key.in
          .filter((key) => Object.hasOwn(settings, key))
          .map((key) => ({ key, value: settings[key] }));
      },
      async findUnique({ where }) {
        return Object.hasOwn(settings, where.key)
          ? { key: where.key, value: settings[where.key] }
          : null;
      },
      async upsert(query) {
        writes.push(JSON.parse(JSON.stringify(query)));
        if (cacheError) throw cacheError;
        return query.create;
      },
    },
  };
  const fetchMock = async (url, options) => {
    fetchCalls.push({ url, options });
    if (networkError) throw networkError;
    if (!gatewayResponse) throw new Error("Unexpected gateway request in this test");
    return gatewayResponse;
  };

  function load(compiled, filename, imports) {
    const module = { exports: {} };
    const context = vm.createContext({
      module,
      exports: module.exports,
      require(specifier) {
        if (!Object.hasOwn(imports, specifier)) {
          throw new Error(`Unexpected import: ${specifier}`);
        }
        return imports[specifier];
      },
      fetch: fetchMock,
      AbortSignal,
      console: { error: (...args) => errors.push(args) },
    });
    new vm.Script(compiled, { filename }).runInContext(context);
    return module.exports;
  }

  const pagbank = load(compiledPagbank, pagbankPath, { "./prisma": { prisma } });
  const route = load(compiledRoute, routePath, {
    "next/server": { NextResponse },
    "@/lib/prisma": { prisma },
    "@/lib/pagbank": pagbank,
  });

  return { GET: route.GET, fetchCalls, writes, errors };
}

async function assertPublicResponse(harness, expected, expectedStatus = 200) {
  const response = await harness.GET();
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body, expected);
  assert.equal(JSON.stringify(body).includes(fakeToken), false, "token must remain private");
  return body;
}

test("preserves the legacy Pagar.me default when gateway configuration is absent", async () => {
  const harness = createHarness();
  await assertPublicResponse(harness, { publicKey: null, cardGateway: "pagarme" });
  assert.equal(harness.fetchCalls.length, 0);
  assert.equal(harness.writes.length, 0);
});

test("returns 503 if settings cannot be read instead of reporting a successful legacy fallback", async () => {
  const harness = createHarness({
    settingsError: new Error(`Simulated database failure containing ${fakeToken}`),
  });
  await assertPublicResponse(harness, { publicKey: null, cardGateway: "pagarme" }, 503);
  assert.equal(harness.fetchCalls.length, 0);
  assert.equal(harness.writes.length, 0);
  assert.equal(JSON.stringify(harness.errors).includes(fakeToken), false);
});

test("returns the selected PagBank gateway and cached public key without contacting PagBank", async () => {
  const harness = createHarness({
    settings: {
      card_gateway: "pagbank",
      pagbank_public_key: `  ${fakePublicKey}\n`,
      pagbank_token: fakeToken,
    },
  });
  await assertPublicResponse(harness, { publicKey: fakePublicKey, cardGateway: "pagbank" });
  assert.equal(harness.fetchCalls.length, 0);
  assert.equal(harness.writes.length, 0);
});

test("falls back to the legacy gateway for an unsupported configured value", async () => {
  const harness = createHarness({
    settings: { card_gateway: "unknown-gateway", pagbank_public_key: fakePublicKey },
  });
  await assertPublicResponse(harness, { publicKey: fakePublicKey, cardGateway: "pagarme" });
  assert.equal(harness.fetchCalls.length, 0);
});

test("reads the existing remote key using only GET and caches the public key without exposing the token", async () => {
  const harness = createHarness({
    settings: {
      card_gateway: "pagbank",
      pagbank_public_key: "  ",
      pagbank_token: `  Bearer ${fakeToken}\n`,
    },
    gatewayResponse: { ok: true, json: async () => ({ public_key: ` ${fakePublicKey}\n` }) },
  });
  await assertPublicResponse(harness, { publicKey: fakePublicKey, cardGateway: "pagbank" });
  assert.equal(harness.fetchCalls.length, 1);
  const [{ url, options }] = harness.fetchCalls;
  assert.equal(url, gatewayUrl);
  assert.equal(options.method, "GET", "checkout config must never create or rotate the shared account key");
  assert.equal(options.body, undefined);
  assert.equal(options.headers.Authorization, `Bearer ${fakeToken}`);
  assert.equal(options.cache, "no-store");
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(harness.writes, [{
    where: { key: "pagbank_public_key" },
    update: { value: fakePublicKey },
    create: { key: "pagbank_public_key", value: fakePublicKey },
  }]);
});

for (const token of [undefined, "", "  Bearer \n"]) {
  test(`keeps PagBank selected when no usable token exists (${JSON.stringify(token)})`, async () => {
    const harness = createHarness({
      settings: {
        card_gateway: "pagbank",
        ...(token === undefined ? {} : { pagbank_token: token }),
      },
    });
    await assertPublicResponse(harness, { publicKey: null, cardGateway: "pagbank" });
    assert.equal(harness.fetchCalls.length, 0);
    assert.equal(harness.writes.length, 0);
  });
}

test("keeps PagBank selected when the gateway rejects the request", async () => {
  const harness = createHarness({
    settings: { card_gateway: "pagbank", pagbank_token: fakeToken },
    gatewayResponse: { ok: false, json: async () => { throw new Error("Error body must not be needed"); } },
  });
  await assertPublicResponse(harness, { publicKey: null, cardGateway: "pagbank" });
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.writes.length, 0);
});

test("keeps PagBank selected on a network failure and does not expose gateway error details", async () => {
  const harness = createHarness({
    settings: { card_gateway: "pagbank", pagbank_token: fakeToken },
    networkError: new Error(`Simulated network failure containing ${fakeToken}`),
  });
  await assertPublicResponse(harness, { publicKey: null, cardGateway: "pagbank" }, 503);
  assert.equal(harness.writes.length, 0);
  assert.equal(JSON.stringify(harness.errors).includes(fakeToken), false);
});

test("keeps the legacy Pagar.me checkout available when reading a PagBank key fails over the network", async () => {
  const harness = createHarness({
    settings: { pagbank_token: fakeToken },
    networkError: new Error(`Simulated PagBank network failure containing ${fakeToken}`),
  });
  await assertPublicResponse(harness, { publicKey: null, cardGateway: "pagarme" });
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.writes.length, 0);
  assert.equal(JSON.stringify(harness.errors).includes(fakeToken), false);
});

test("keeps explicitly selected Pagar.me available when PagBank returns malformed JSON", async () => {
  const harness = createHarness({
    settings: { card_gateway: "pagarme", pagbank_token: fakeToken },
    gatewayResponse: { ok: true, json: async () => { throw new SyntaxError("Invalid PagBank JSON"); } },
  });
  await assertPublicResponse(harness, { publicKey: null, cardGateway: "pagarme" });
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.writes.length, 0);
});

for (const [label, body] of [
  ["null", null],
  ["missing key", {}],
  ["wrong field", { publicKey: fakePublicKey }],
  ["non-string key", { public_key: 123 }],
  ["blank key", { public_key: " \n " }],
]) {
  test(`does not store an invalid gateway response (${label})`, async () => {
    const harness = createHarness({
      settings: { card_gateway: "pagbank", pagbank_token: fakeToken },
      gatewayResponse: { ok: true, json: async () => body },
    });
    await assertPublicResponse(harness, { publicKey: null, cardGateway: "pagbank" });
    assert.equal(harness.writes.length, 0);
  });
}

test("does not store malformed JSON returned by the gateway", async () => {
  const harness = createHarness({
    settings: { card_gateway: "pagbank", pagbank_token: fakeToken },
    gatewayResponse: { ok: true, json: async () => { throw new SyntaxError("Invalid JSON"); } },
  });
  await assertPublicResponse(harness, { publicKey: null, cardGateway: "pagbank" }, 503);
  assert.equal(harness.writes.length, 0);
});

test("still returns the retrieved public key if saving its local cache fails", async () => {
  const harness = createHarness({
    settings: { card_gateway: "pagbank", pagbank_token: fakeToken },
    gatewayResponse: { ok: true, json: async () => ({ public_key: fakePublicKey }) },
    cacheError: new Error("Simulated local cache failure"),
  });
  await assertPublicResponse(harness, { publicKey: fakePublicKey, cardGateway: "pagbank" });
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.writes.length, 1);
});
