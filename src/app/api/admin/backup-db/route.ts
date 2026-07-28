import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/cron-auth";
import { readFile, stat } from "fs/promises";
import path from "path";

export const maxDuration = 120;

/** Caminho do arquivo SQLite, a partir da DATABASE_URL. */
function caminhoDoBanco(): string {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const semPrefixo = url.replace(/^file:/, "");
  return path.isAbsolute(semPrefixo)
    ? semPrefixo
    : path.join(process.cwd(), "prisma", semPrefixo.replace(/^\.\//, ""));
}

/**
 * GET /api/admin/backup-db?secret=XXX
 *
 * Baixa uma cópia do banco. Todo o sistema — reservas, hóspedes, financeiro —
 * vive num único arquivo dentro do volume; sem cópia fora dali, um problema no
 * volume leva tudo junto.
 *
 * Feito para ser chamado por um agendador (Task Scheduler, cron) guardando o
 * arquivo com data no nome.
 */
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(new URL(req.url).searchParams.get("secret"));
  if (denied) return denied;

  const caminho = caminhoDoBanco();

  try {
    const info = await stat(caminho);
    const buffer = await readFile(caminho);

    // AAAA-MM-DD no nome, para o agendador acumular versões sem sobrescrever
    const dia = new Date().toISOString().slice(0, 10);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="rentalpro-${dia}.db"`,
        "Content-Length": String(info.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
