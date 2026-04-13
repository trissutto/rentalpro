import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  migrationDone: boolean;
};

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Auto-migration: add new columns if they don't exist yet.
// Safe to run on every cold start — each ALTER TABLE is idempotent.
async function runMigrations() {
  if (globalForPrisma.migrationDone) return;
  globalForPrisma.migrationDone = true;

  const migrations: [string, string][] = [
    [
      `ALTER TABLE properties ADD COLUMN idealGuests INTEGER NOT NULL DEFAULT 2`,
      "properties.idealGuests",
    ],
    [
      `ALTER TABLE properties ADD COLUMN maxGuests INTEGER NOT NULL DEFAULT 6`,
      "properties.maxGuests",
    ],
    [
      `ALTER TABLE properties ADD COLUMN extraGuestFee REAL NOT NULL DEFAULT 0`,
      "properties.extraGuestFee",
    ],
    [
      `ALTER TABLE properties ADD COLUMN accessInstructions TEXT`,
      "properties.accessInstructions",
    ],
    [
      `ALTER TABLE properties ADD COLUMN wifiName TEXT`,
      "properties.wifiName",
    ],
    [
      `ALTER TABLE properties ADD COLUMN wifiPassword TEXT`,
      "properties.wifiPassword",
    ],
    [
      `ALTER TABLE properties ADD COLUMN checkInTime TEXT DEFAULT '14:00'`,
      "properties.checkInTime",
    ],
    [
      `ALTER TABLE properties ADD COLUMN checkOutTime TEXT DEFAULT '12:00'`,
      "properties.checkOutTime",
    ],
    [
      `ALTER TABLE financial_transactions ADD COLUMN propertyId TEXT`,
      "financial_transactions.propertyId",
    ],
  ];

  for (const [sql, label] of migrations) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`[migration] ✅ ${label}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        // Column already there — skip silently
      } else {
        console.warn(`[migration] ⚠ ${label}:`, msg);
      }
    }
  }
}

// Fire and forget — runs once on first import
runMigrations().catch(console.error);
