import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/cron-auth";
import { otimizarImagem, formatoSuportado } from "@/lib/image";
import { readdir, readFile, writeFile, stat } from "fs/promises";
import path from "path";

export const maxDuration = 300;

const UPLOADS_DIR = path.join(process.cwd(), "prisma", "uploads");

/** Abaixo disso não vale reprocessar — já está no tamanho de web. */
const IGNORAR_ABAIXO_DE = 400 * 1024;

interface Arquivo {
  caminho: string;
  bytes: number;
}

/** Percorre a pasta de uploads inteira, incluindo as subpastas por imóvel. */
async function listarImagens(dir: string): Promise<Arquivo[]> {
  const achados: Arquivo[] = [];

  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return achados;
  }

  for (const entrada of entradas) {
    const completo = path.join(dir, entrada.name);

    if (entrada.isDirectory()) {
      achados.push(...(await listarImagens(completo)));
      continue;
    }

    const ext = entrada.name.split(".").pop() ?? "";
    if (!formatoSuportado(ext)) continue;

    const info = await stat(completo);
    achados.push({ caminho: completo, bytes: info.size });
  }

  return achados;
}

function mb(bytes: number): number {
  return Math.round((bytes / 1048576) * 100) / 100;
}

/**
 * GET /api/admin/optimize-photos?secret=XXX[&limit=20][&dryRun=1]
 *
 * Recomprime as fotos que já estão no volume. As fotos vieram direto da câmera
 * (5 a 11 MB cada) e uma galeria assim não abre no celular.
 *
 * Reescreve cada arquivo no lugar, mantendo nome e formato — os caminhos estão
 * gravados no banco, então renomear quebraria as referências.
 *
 * Roda em lotes (`limit`, padrão 20): chame de novo até `restantes` zerar.
 * `dryRun=1` só relata o que faria, sem tocar em nada.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const denied = checkCronSecret(url.searchParams.get("secret"));
  if (denied) return denied;

  const limit  = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 20)));
  const dryRun = url.searchParams.get("dryRun") === "1";

  const todas = await listarImagens(UPLOADS_DIR);
  const candidatas = todas
    .filter(a => a.bytes > IGNORAR_ABAIXO_DE)
    .sort((a, b) => b.bytes - a.bytes); // as maiores primeiro — é onde está o ganho

  const lote = candidatas.slice(0, limit);

  let bytesAntes = 0;
  let bytesDepois = 0;
  let processadas = 0;
  const detalhes: { arquivo: string; de: number; para: number }[] = [];

  for (const arq of lote) {
    const ext = arq.caminho.split(".").pop() ?? "jpg";

    try {
      const original = await readFile(arq.caminho);
      const resultado = await otimizarImagem(original, ext);

      bytesAntes  += resultado.bytesAntes;
      bytesDepois += resultado.bytesDepois;

      if (resultado.otimizada) {
        if (!dryRun) await writeFile(arq.caminho, resultado.buffer);
        processadas++;
        detalhes.push({
          arquivo: path.relative(UPLOADS_DIR, arq.caminho),
          de:   mb(resultado.bytesAntes),
          para: mb(resultado.bytesDepois),
        });
      }
    } catch (e) {
      console.error(`[otimizar] falhou ${arq.caminho}:`, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    totalDeImagens: todas.length,
    acimaDoLimite: candidatas.length,
    processadasAgora: processadas,
    restantes: Math.max(0, candidatas.length - lote.length),
    economiaMB: mb(bytesAntes - bytesDepois),
    antesMB: mb(bytesAntes),
    depoisMB: mb(bytesDepois),
    detalhes,
  });
}
