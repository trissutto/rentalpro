import path from "path";

export function privateReceiptRoot() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith("file:")) throw new Error("Armazenamento privado indisponível.");
  const databaseFile = databaseUrl.slice(5);
  const resolved = path.isAbsolute(databaseFile) ? databaseFile : path.resolve(process.cwd(), "prisma", databaseFile);
  return path.join(path.dirname(resolved), "private-receipts");
}

export function receiptFilePath(code: string, filename: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(code) || !/^parcela-\d+-[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp|pdf|heic|heif)$/.test(filename)) throw new Error("Comprovante inválido.");
  return path.join(privateReceiptRoot(), code.toUpperCase(), filename);
}

export function privateReceiptUrl(code: string, filename: string) {
  receiptFilePath(code, filename);
  return `/api/public/payments/receipt/${encodeURIComponent(code.toUpperCase())}/${encodeURIComponent(filename)}`;
}
