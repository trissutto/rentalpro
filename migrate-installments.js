/**
 * migrate-installments.js
 * Adds installmentData, receiptUrl, receiptStatus columns to reservations (if not exist)
 */

const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "prisma", "dev.db");

try {
  const db = new Database(DB_PATH);
  const cols = db.pragma("table_info(reservations)").map((c) => c.name);

  const migrations = [
    { col: "installmentData", sql: "ALTER TABLE reservations ADD COLUMN installmentData TEXT DEFAULT NULL" },
    { col: "receiptUrl",      sql: "ALTER TABLE reservations ADD COLUMN receiptUrl TEXT DEFAULT NULL" },
    { col: "receiptStatus",   sql: "ALTER TABLE reservations ADD COLUMN receiptStatus TEXT DEFAULT NULL" },
  ];

  for (const m of migrations) {
    if (!cols.includes(m.col)) {
      db.exec(m.sql);
      console.log(`✅ Coluna ${m.col} adicionada`);
    } else {
      console.log(`ℹ️  ${m.col} já existe`);
    }
  }

  db.close();
  process.exit(0);
} catch (err) {
  console.error("❌ Erro na migração:", err.message);
  process.exit(1);
}
