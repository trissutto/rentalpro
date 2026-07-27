import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCronSecret } from "@/lib/cron-auth";
import { writeFile, copyFile, stat } from "fs/promises";
import path from "path";

export const maxDuration = 300;

/** Caminho real do arquivo SQLite, a partir da DATABASE_URL (`file:/app/prisma/dev.db`). */
function caminhoDoBanco(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const semPrefixo = url.replace(/^file:/, "");
  return path.isAbsolute(semPrefixo)
    ? semPrefixo
    : path.join(process.cwd(), "prisma", semPrefixo.replace(/^\.\//, ""));
}

/** Todo arquivo SQLite começa com esta assinatura de 16 bytes. */
function pareceSqlite(buf: Buffer): boolean {
  return buf.subarray(0, 15).toString("utf8") === "SQLite format 3";
}

/**
 * POST /api/admin/restore-db?secret=XXX[&force=1]
 * multipart/form-data com o campo `file` = arquivo dev.db
 *
 * Sobe o banco de produção para um ambiente novo (a migração do VPS para o
 * Railway). Pensado para ser usado UMA vez, com o volume ainda vazio.
 *
 * Trava de segurança: se o banco atual já tiver reservas, a rota recusa —
 * restaurar por cima apagaria dados reais. `force=1` ignora a trava, e nesse
 * caso o arquivo anterior é preservado ao lado como `dev.db.bak-<timestamp>`.
 *
 * Depois de restaurar é PRECISO reiniciar o serviço: o processo ainda tem o
 * arquivo antigo aberto.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const denied = checkCronSecret(url.searchParams.get("secret"));
  if (denied) return denied;

  const force = url.searchParams.get("force") === "1";

  // Banco novo não tem reserva nenhuma; com dados dentro, exigimos force.
  let reservasExistentes = 0;
  try {
    reservasExistentes = await prisma.reservation.count();
  } catch {
    reservasExistentes = 0; // tabela ainda não existe = banco vazio
  }

  if (reservasExistentes > 0 && !force) {
    return NextResponse.json(
      {
        error: "O banco atual já tem dados — restaurar por cima apagaria reservas.",
        reservasExistentes,
        comoProsseguir: "Se a intenção é mesmo substituir, repita com &force=1",
      },
      { status: 409 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Envie o arquivo no campo `file` (multipart/form-data)" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!pareceSqlite(buffer)) {
    return NextResponse.json(
      { error: "O arquivo enviado não é um banco SQLite válido" },
      { status: 400 }
    );
  }

  const destino = caminhoDoBanco();

  // Preserva o que estava lá antes de sobrescrever
  let backup: string | null = null;
  try {
    await stat(destino);
    backup = `${destino}.bak-${Date.now()}`;
    await copyFile(destino, backup);
  } catch {
    // não existia ainda — primeira carga, nada a preservar
  }

  await writeFile(destino, buffer);

  return NextResponse.json({
    ok: true,
    destino,
    bytes: buffer.length,
    backup,
    atencao: "Reinicie o serviço agora — o processo ainda usa o banco anterior.",
  });
}
