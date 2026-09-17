const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Run only after a verified backup. LEGACY_RECEIPTS_ROOT may point to a staged
// copy on the persistent volume (never the immutable backup itself).
// Re-running is safe after a partial deploy:
// the source is removed only after hash verification and the DB commit.
async function migrateLegacyReceipts({ prisma, sourceRoot, destinationRoot }) {
  const source = path.resolve(sourceRoot), destination = path.resolve(destinationRoot);
  if (source === destination || destination.startsWith(source + path.sep)) throw new Error('Invalid receipt migration paths');
  const copied = [];
  let directories;
  try { directories = await fs.readdir(source, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return { copied: 0, updated: 0 }; throw error; }
  for (const dir of directories) {
    if (!dir.isDirectory() || !/^[A-Za-z0-9_-]{1,100}$/.test(dir.name)) throw new Error('Unexpected legacy receipt directory');
    for (const file of await fs.readdir(path.join(source, dir.name), { withFileTypes: true })) {
      if (!file.isFile() || !/^parcela-\d+-[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp|pdf|heic|heif)$/.test(file.name)) throw new Error('Unexpected legacy receipt file');
      const from = path.join(source, dir.name, file.name), to = path.join(destination, dir.name.toUpperCase(), file.name);
      await fs.mkdir(path.dirname(to), { recursive: true });
      const bytes = await fs.readFile(from);
      try { await fs.writeFile(to, bytes, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const hash = data => createHash('sha256').update(data).digest('hex');
      if (hash(bytes) !== hash(await fs.readFile(to))) throw new Error('Receipt copy verification failed; original retained');
      copied.push({ from, oldUrl: `/uploads/receipts/${dir.name}/${file.name}`, newUrl: `/api/public/payments/receipt/${dir.name.toUpperCase()}/${file.name}` });
    }
  }
  let updated = 0;
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe("UPDATE reservations SET id = id WHERE id = '__receipt_migration_lock__'");
    const rows = await tx.reservation.findMany({ where: { installmentData: { not: null } }, select: { id: true, installmentData: true } });
    const urls = new Map(copied.map(item => [item.oldUrl, item.newUrl]));
    for (const row of rows) {
      const plan = JSON.parse(row.installmentData); let changed = false;
      for (const item of plan.items ?? []) if (urls.has(item.receiptUrl)) { item.receiptUrl = urls.get(item.receiptUrl); changed = true; }
      if (changed) { await tx.reservation.update({ where: { id: row.id }, data: { installmentData: JSON.stringify(plan) } }); updated++; }
    }
  });
  for (const item of copied) await fs.unlink(item.from);
  return { copied: copied.length, updated };
}

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('file:')) throw new Error('SQLite DATABASE_URL required');
  const filename = url.slice(5);
  const databasePath = path.isAbsolute(filename) ? filename : path.resolve(process.cwd(), 'prisma', filename);
  const prisma = new PrismaClient();
  try { console.log('Private receipt migration:', await migrateLegacyReceipts({ prisma, sourceRoot: path.resolve(process.env.LEGACY_RECEIPTS_ROOT || 'public/uploads/receipts'), destinationRoot: path.join(path.dirname(databasePath), 'private-receipts') })); }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch(() => { console.error('Receipt migration failed; inspect backup and paths before restarting.'); process.exitCode = 1; });
module.exports = { migrateLegacyReceipts };
