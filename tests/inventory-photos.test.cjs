const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const next = require("next/server");
const sharp = require("sharp");
const { createTestDatabase } = require("./helpers/reservation-db.cjs");

function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: file,
  }).outputText;
  new vm.Script(source, { filename: file }).runInNewContext({ module, exports: module.exports, URL, Date, JSON, Buffer, File, FormData,
    console: { error() {}, warn() {}, log() {} }, ...globals,
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name === "next/server") return next;
      if (["fs/promises", "path", "crypto", "sharp"].includes(name)) return require(name);
      throw new Error("Unmocked dependency: " + name);
    },
  });
  return module.exports;
}
const request = (url, init) => new next.NextRequest("https://synthetic.invalid" + url, init);

test("inventory photos: camera upload becomes light WebP + thumbnail, is listed on the item, and can be deleted", async t => {
  const db = await createTestDatabase(); t.after(db.cleanup);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reservas-ita-uploads-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { prisma } = db;

  await prisma.user.create({ data: { id: "o", name: "o", email: "o@example.test", password: "synthetic", role: "OWNER" } });
  await prisma.property.create({ data: { id: "p", ownerId: "o", name: "Casa", slug: "casa", address: "Test", city: "Test", state: "SP", basePrice: 100 } });
  await prisma.item.create({ data: { id: "geladeira", name: "Geladeira", category: "Cozinha" } });
  await prisma.propertyItem.create({ data: { id: "pi1", propertyId: "p", itemId: "geladeira" } });

  const lib = load("src/lib/inventory-photos.ts");
  const image = load("src/lib/image.ts");
  let user = { id: "t", role: "TEAM" };
  const fakeProcess = { ...process, cwd: () => root };
  const route = load("src/app/api/property-items/[id]/photos/route.ts", {
    "@/lib/prisma": { prisma }, "@/lib/auth": { getAuthUser: async () => user },
    "@/lib/image": image, "@/lib/inventory-photos": lib,
  }, { process: fakeProcess });

  // Simulated phone photo: 4000x3000 noisy JPEG (noise keeps it from compressing to nothing)
  const raw = Buffer.alloc(4000 * 3000 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  const camera = await sharp(raw, { raw: { width: 4000, height: 3000, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  const upload = () => { const fd = new FormData(); fd.append("file", new File([camera], "IMG_0001.jpg", { type: "image/jpeg" })); return fd; };

  const res = await route.POST(request("/api/property-items/pi1/photos", { method: "POST", body: upload() }), { params: { id: "pi1" } });
  assert.equal(res.status, 201);
  const { propertyItem, photo } = await res.json();
  assert.match(photo.url, /^\/api\/files\/inventario\/pi1\/[\w-]+\.webp$/);
  assert.deepEqual(lib.lerFotos(propertyItem.photos).map(f => f.url), [photo.url]);

  const saved = path.join(root, "prisma", "uploads", "inventario", "pi1");
  const big = fs.readFileSync(path.join(saved, path.basename(photo.url)));
  const thumb = fs.readFileSync(path.join(saved, path.basename(photo.thumb)));
  const meta = await sharp(big).metadata();
  assert.equal(meta.format, "webp"); assert.equal(Math.max(meta.width, meta.height), 1280);
  assert.ok(big.length < camera.length / 4, "photo must be much lighter than the camera original");
  assert.equal((await sharp(thumb).metadata()).width, 320);

  // Owners can't add or delete; unknown items 404
  user = { id: "o", role: "OWNER" };
  assert.equal((await route.POST(request("/x", { method: "POST", body: upload() }), { params: { id: "pi1" } })).status, 403);
  user = { id: "t", role: "TEAM" };
  assert.equal((await route.POST(request("/x", { method: "POST", body: upload() }), { params: { id: "nope" } })).status, 404);

  const del = await route.DELETE(request("/x", { method: "DELETE", body: JSON.stringify({ url: photo.url }) }), { params: { id: "pi1" } });
  assert.equal(del.status, 200);
  assert.deepEqual(lib.lerFotos((await del.json()).propertyItem.photos), []);
  assert.equal(fs.existsSync(path.join(saved, path.basename(photo.url))), false);
  assert.equal((await route.DELETE(request("/x", { method: "DELETE", body: JSON.stringify({ url: photo.url }) }), { params: { id: "pi1" } })).status, 404);
});

test("photo files are public and cacheable by Cloudflare while other API routes stay private", async () => {
  const config = require("../next.config.js");
  const rules = await config.headers();
  const privateRule = rules.find(r => r.headers.some(h => h.key === "Cache-Control" && h.value.includes("no-store")));
  const { pathToRegexp } = require("next/dist/compiled/path-to-regexp");
  const matches = p => pathToRegexp(privateRule.source, []).test(p);
  assert.equal(matches("/api/files/inventario/pi1/a.webp"), false);
  assert.equal(matches("/api/reservations"), true);
  assert.equal(matches("/api/property-items/pi1/photos"), true);
  assert.equal(matches("/api/filesystem-leak"), true);
});
