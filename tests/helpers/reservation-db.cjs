const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { Prisma, PrismaClient } = require("@prisma/client");

/** Disposable SQLite schema from generated model metadata. Never imports app prisma or .env. */
async function createTestDatabase() {
  const parent = path.resolve(tmpdir());
  const directory = mkdtempSync(path.join(parent, "reservas-ita-test-"));
  const databasePath = path.join(directory, "synthetic.db");
  const prisma = new PrismaClient({ datasources: { db: { url: "file:" + databasePath.replace(/\\/g, "/") } }, log: [] });
  const quoted = value => '"' + value.replace(/"/g, '""') + '"';
  const scalar = value => typeof value === "string" ? "'" + value.replace(/'/g, "''") + "'" : typeof value === "boolean" ? (value ? "1" : "0") : String(value);
  try {
    for (const model of Prisma.dmmf.datamodel.models) {
      const columns = model.fields.filter(field => field.kind === "scalar" || field.kind === "enum").map(field => {
        const sqlType = { String: "TEXT", Int: "INTEGER", BigInt: "INTEGER", Boolean: "BOOLEAN", Float: "REAL", Decimal: "DECIMAL", DateTime: "DATETIME", Bytes: "BLOB", Json: "TEXT" }[field.type] || "TEXT";
        let definition = quoted(field.dbName || field.name) + " " + sqlType;
        if (field.isId) definition += " PRIMARY KEY";
        if (field.isRequired) definition += " NOT NULL";
        if (field.isUnique) definition += " UNIQUE";
        if (field.hasDefaultValue && field.default !== undefined) {
          if (field.default && typeof field.default === "object") {
            if (field.default.name === "now") definition += " DEFAULT CURRENT_TIMESTAMP";
          } else definition += " DEFAULT " + scalar(field.default);
        }
        return definition;
      });
      await prisma.$executeRawUnsafe("CREATE TABLE " + quoted(model.dbName || model.name) + " (" + columns.join(", ") + ")");
    }
  } catch (error) {
    await prisma.$disconnect();
    if (path.dirname(path.resolve(directory)) === parent && path.basename(directory).startsWith("reservas-ita-test-")) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return { prisma, databasePath, async cleanup() {
    await prisma.$disconnect();
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith("reservas-ita-test-")) throw new Error("Refusing cleanup outside the synthetic test directory");
    rmSync(resolved, { recursive: true, force: true });
  } };
}

module.exports = { createTestDatabase };
