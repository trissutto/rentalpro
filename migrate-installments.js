/**
 * migrate-installments.js
 * Adiciona coluna installmentData à tabela reservations (se não existir)
 */

const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "prisma", "dev.db");

try {
  const db = new Database(DB_PATH);

  // Check existing columns
  const cols = db.pragma("table_info(reservations)").map((c) => c.name);

  if (!cols.includes("installmentData")) {
    db.exec("ALTER TABLE reservations ADD COLUMN installmentData TEXT DEFAULT NULL");
    console.log("✅ Coluna installmentData adicionada à tabela reservations");
  } else {
    console.log("ℹ️  Coluna installmentData já existe — nada a fazer");
  }

  db.close();
  process.exit(0);
} catch (err) {
  console.error("❌ Erro na migração installments:", err.message);
  process.exit(1);
}
