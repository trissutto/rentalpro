import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/cron-auth";
import { writeFile, unlink, mkdir } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const exec = promisify(execFile);

export const maxDuration = 300;

const UPLOADS_DIR = path.join(process.cwd(), "prisma", "uploads");

/**
 * Uma entrada de tar é perigosa quando escapa do diretório de destino —
 * caminho absoluto ou qualquer `..` no meio do caminho.
 */
function entradaPerigosa(nome: string): boolean {
  if (nome.startsWith("/")) return true;
  return nome.split("/").some(parte => parte === "..");
}

/**
 * POST /api/admin/restore-uploads?secret=XXX
 * multipart/form-data com o campo `file` = tar.gz das fotos
 *
 * Restaura no volume as fotos que hoje vivem no servidor antigo. Usado uma vez,
 * na migração do VPS para o Railway.
 *
 * O conteúdo é conferido antes de extrair: o tar vem de fora, e uma entrada com
 * `..` no caminho escreveria fora da pasta de uploads.
 */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(new URL(req.url).searchParams.get("secret"));
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Envie o arquivo .tar.gz no campo `file` (multipart/form-data)" },
      { status: 400 }
    );
  }

  const tmp = path.join(os.tmpdir(), `uploads-restore-${Date.now()}.tgz`);
  await writeFile(tmp, Buffer.from(await file.arrayBuffer()));

  try {
    // 1. Confere o conteúdo antes de escrever qualquer coisa
    const { stdout: listagem } = await exec("tar", ["tzf", tmp], {
      maxBuffer: 20 * 1024 * 1024,
    });
    const entradas = listagem.split("\n").map(l => l.trim()).filter(Boolean);

    const perigosas = entradas.filter(entradaPerigosa);
    if (perigosas.length > 0) {
      return NextResponse.json(
        {
          error: "O arquivo contém caminhos que escapam da pasta de uploads",
          exemplos: perigosas.slice(0, 5),
        },
        { status: 400 }
      );
    }

    // 2. Extrai
    await mkdir(UPLOADS_DIR, { recursive: true });
    await exec("tar", ["xzf", tmp, "-C", UPLOADS_DIR]);

    const arquivos = entradas.filter(e => !e.endsWith("/"));

    return NextResponse.json({
      ok: true,
      destino: UPLOADS_DIR,
      arquivos: arquivos.length,
      amostra: arquivos.slice(0, 5),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
