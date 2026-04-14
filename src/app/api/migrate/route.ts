import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/migrate
 * Adds missing columns to SQLite without needing `npx prisma db push`.
 * Safe to call multiple times — each ALTER TABLE is idempotent.
 * No auth required: only ever ADDS columns, never deletes data.
 */
export async function GET() {
  const results: string[] = [];

  async function addCol(sql: string, label: string) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.push(`✅ ${label}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        results.push(`⏭  ${label} (já existe)`);
      } else {
        results.push(`❌ ${label}: ${msg}`);
      }
    }
  }

  await addCol(`ALTER TABLE properties ADD COLUMN idealGuests   INTEGER NOT NULL DEFAULT 2`, "properties.idealGuests");
  await addCol(`ALTER TABLE properties ADD COLUMN maxGuests     INTEGER NOT NULL DEFAULT 6`, "properties.maxGuests");
  await addCol(`ALTER TABLE properties ADD COLUMN extraGuestFee REAL    NOT NULL DEFAULT 0`, "properties.extraGuestFee");
  await addCol(`ALTER TABLE properties ADD COLUMN accessInstructions TEXT`,                  "properties.accessInstructions");
  await addCol(`ALTER TABLE properties ADD COLUMN wifiName      TEXT`,                       "properties.wifiName");
  await addCol(`ALTER TABLE properties ADD COLUMN wifiPassword  TEXT`,                       "properties.wifiPassword");
  await addCol(`ALTER TABLE properties ADD COLUMN checkInTime   TEXT DEFAULT '14:00'`,       "properties.checkInTime");
  await addCol(`ALTER TABLE properties ADD COLUMN checkOutTime  TEXT DEFAULT '12:00'`,       "properties.checkOutTime");
  await addCol(`ALTER TABLE financial_transactions ADD COLUMN propertyId TEXT`,              "financial_transactions.propertyId");

  // Return a nice HTML page so the result is readable in the browser
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Migração do banco</title>
  <style>
    body { font-family: monospace; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1 { color: #38bdf8; }
    li { margin: 4px 0; font-size: 1.1rem; }
    .ok { color: #4ade80; }
    .skip { color: #94a3b8; }
    .err { color: #f87171; }
    .done { margin-top: 2rem; padding: 1rem; background: #1e3a5f; border-radius: 8px; color: #7dd3fc; }
  </style>
</head>
<body>
  <h1>🗄 Migração do banco de dados</h1>
  <ul>
    ${results.map(r => {
      const cls = r.startsWith("✅") ? "ok" : r.startsWith("⏭") ? "skip" : "err";
      return `<li class="${cls}">${r}</li>`;
    }).join("\n    ")}
  </ul>
  <div class="done">
    ✅ Concluído! Agora edite o imóvel e salve — os campos <strong>Ideal, Limite e Taxa extra</strong> vão persistir.
    <br><br>
    <a href="/properties" style="color:#38bdf8">← Voltar para Imóveis</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
