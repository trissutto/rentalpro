/**
 * Migração: cria tabela date_blocks e adiciona icalUrls à properties
 * Execute uma vez: node migrate-dateblocks.js
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🔧 Criando tabela date_blocks e adicionando icalUrls...");

  // 1. Criar tabela date_blocks
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS date_blocks (
        id         TEXT     PRIMARY KEY,
        propertyId TEXT     NOT NULL,
        startDate  DATETIME NOT NULL,
        endDate    DATETIME NOT NULL,
        reason     TEXT     NOT NULL DEFAULT 'Bloqueio',
        type       TEXT     NOT NULL DEFAULT 'MANUAL',
        source     TEXT,
        createdAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (propertyId) REFERENCES properties(id) ON DELETE CASCADE
      )
    `);
    console.log("✅ Tabela date_blocks criada (ou já existia)");
  } catch (e) {
    console.error("❌ Erro ao criar date_blocks:", e.message);
  }

  // 2. Adicionar coluna icalUrls à properties
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE properties ADD COLUMN icalUrls TEXT NOT NULL DEFAULT '[]'`
    );
    console.log("✅ Coluna icalUrls adicionada à tabela properties");
  } catch (e) {
    if (e.message?.includes("duplicate column")) {
      console.log("ℹ️  Coluna icalUrls já existe");
    } else {
      console.error("❌ Erro ao adicionar icalUrls:", e.message);
    }
  }

  console.log("\n🎉 Migração concluída! Reinicie o servidor (npm run dev).");
}

main()
  .catch((e) => { console.error("❌ Erro fatal:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
