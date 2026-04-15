import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const code = (formData.get("code") as string)?.toUpperCase();
    const seq = Number(formData.get("seq"));
    const file = formData.get("file") as File | null;

    if (!code || !seq || !file) {
      return NextResponse.json({ error: "code, seq e file são obrigatórios" }, { status: 400 });
    }

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
    const uploadDir = path.join(process.cwd(), "public", "uploads", "receipts", code);
    await mkdir(uploadDir, { recursive: true });

    const filename = `parcela-${seq}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);

    const receiptUrl = `/uploads/receipts/${code}/${filename}`;

    // Atualiza o item com receiptUrl
    item.receiptUrl = receiptUrl;
    item.receiptUploadedAt = new Date().toISOString();

    await (prisma as any).$executeRawUnsafe(
      `UPDATE reservations SET installmentData = ? WHERE id = ?`,
      JSON.stringify(plan),
      rows[0].id
    );

    return NextResponse.json({ ok: true, receiptUrl });
  } catch (err) {
    console.error("Upload receipt error:", err);
    return NextResponse.json({ error: "Erro ao fazer upload do comprovante" }, { status: 500 });
  }
}
