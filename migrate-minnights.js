/**
 * Migração: adiciona coluna minNights à tabela pricing_rules
 * Execute uma vez no terminal: node migrate-minnights.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🔧 Adicionando coluna minNights à tabela pricing_rules...");

  // Adiciona a coluna com default 1 (SQLite suporta ALTER TABLE ADD COLUMN)
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE pricing_rules ADD COLUMN minNights INTEGER NOT NULL DEFAULT 1`
    );
    console.log("✅ Coluna minNights adicionada com sucesso!");
  } catch (e) {
    if (e.message?.includes("duplicate column")) {
      console.log("ℹ️  Coluna minNights já existe, nada a fazer.");
    } else {
      throw e;
    }
  }

  // Atualizar regras do tipo PACKAGE para minNights = 5
  const updatedPackages = await prisma.$executeRawUnsafe(
    `UPDATE pricing_rules SET minNights = 5 WHERE type = 'PACKAGE'`
  );
  console.log(`✅ ${updatedPackages} regras PACKAGE atualizadas para minNights = 5`);

  // Atualizar regras do tipo WEEKEND para minNights = 2
  const updatedWeekend = await prisma.$executeRawUnsafe(
    `UPDATE pricing_rules SET minNights = 2 WHERE type = 'WEEKEND'`
  );
  console.log(`✅ ${updatedWeekend} regras WEEKEND atualizadas para minNights = 2`);

  console.log("\n🎉 Migração concluída! Reinicie o servidor (npm run dev).");
}

main()
  .catch((e) => { console.error("❌ Erro:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
