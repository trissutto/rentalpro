import { authorizeGuestRequest } from "@/lib/guest-access";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { lockPayments } from "@/lib/payment-integrity";
import { privateReceiptUrl, receiptFilePath } from "@/lib/payment-receipts";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const code = (formData.get("code") as string)?.toUpperCase();
    const seq = Number(formData.get("seq"));
    const file = formData.get("file") as File | null;

    if (!code || !Number.isInteger(seq) || seq < 1 || !file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "code, seq e file são obrigatórios" }, { status: 400 });
    }

    const denied = await authorizeGuestRequest(req, String(code), "payments:write");
    if (denied) return denied;
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "O comprovante deve ter até 5 MB." }, { status: 400 });
    // Valida extensão
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const allowed = ["jpg", "jpeg", "png", "webp", "pdf", "heic", "heif"];
    if (!allowed.includes(ext)) {
      return NextResponse.json({ error: "Tipo de arquivo não permitido. Use JPG, PNG, PDF ou WebP." }, { status: 400 });
    }

    // Busca a reserva
    const rows = await (prisma as any).$queryRawUnsafe(
      `SELECT id, installmentData FROM reservations WHERE code = ?`,
      code
    ) as any[];

    if (!rows.length || !rows[0].installmentData) {
      return NextResponse.json({ error: "Reserva ou plano de parcelamento não encontrado" }, { status: 404 });
    }

    let plan: any;
    try { plan = JSON.parse(rows[0].installmentData); } catch {
      return NextResponse.json({ error: "Plano de parcelamento inválido" }, { status: 400 });
    }

    const item = plan.items?.find((i: any) => i.seq === seq);
    if (!item) {
      return NextResponse.json({ error: `Parcela ${seq} não encontrada` }, { status: 404 });
    }

    // Salva o arquivo
    const filename = `parcela-${seq}-${randomUUID()}.${ext}`;
    const destination = receiptFilePath(code, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(destination, buffer, { flag: "wx", mode: 0o600 });

    const receiptUrl = privateReceiptUrl(code, filename);

    // Re-read under the same writer lock as a webhook. Uploading a receipt
    // must never restore stale paid flags from before the file was written.
    await prisma.$transaction(async tx => {
      await lockPayments(tx);
      const current = await tx.reservation.findUniqueOrThrow({ where: { id: rows[0].id } });
      const fresh = JSON.parse(current.installmentData || "{}");
      const part = fresh.items?.find((i: { seq: number }) => i.seq === seq);
      if (!part) throw new Error("Plano alterado durante o envio.");
      part.receiptUrl = receiptUrl;
      part.receiptUploadedAt = new Date().toISOString();
      await tx.reservation.update({ where: { id: current.id }, data: { installmentData: JSON.stringify(fresh) } });
    });

    return NextResponse.json({ ok: true, receiptUrl });
  } catch (err) {
    console.error("Upload receipt error:", err);
    return NextResponse.json({ error: "Erro ao fazer upload do comprovante" }, { status: 500 });
  }
}
