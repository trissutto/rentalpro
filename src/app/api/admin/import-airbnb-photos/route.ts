import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCronSecret } from "@/lib/cron-auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const maxDuration = 300;

const EXT_OK = ["jpg", "jpeg", "png", "webp", "avif"];

/** Extensão a partir da URL (ignora query string); cai em jpg quando não dá pra saber. */
function extDaUrl(url: string): string {
  try {
    const nome = new URL(url).pathname.split("/").pop() ?? "";
    const ext  = nome.split(".").pop()?.toLowerCase() ?? "";
    return EXT_OK.includes(ext) ? ext : "jpg";
  } catch {
    return "jpg";
  }
}

function parseFotos(raw: unknown): string[] {
  try {
    const v = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(v) ? v.filter(x => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Já está no nosso servidor? (`/api/files/...` ou caminho relativo) */
function ehLocal(url: string): boolean {
  return !/^https?:\/\//i.test(url);
}

/**
 * GET /api/admin/import-airbnb-photos?secret=XXX[&limit=20][&propertyId=YYY]
 *
 * Baixa para o volume do servidor as fotos que hoje são servidas direto pelo CDN
 * do Airbnb (a0.muscache.com) e troca as URLs no banco por `/api/files/...`.
 *
 * Sem isso o site depende do Airbnb continuar servindo aquelas URLs — se elas
 * expirarem ou o hotlink for bloqueado, os imóveis ficam sem foto nenhuma.
 *
 * Roda em lotes (`limit`, padrão 20) porque são ~110 imagens: chame quantas
 * vezes forem necessárias até `restantes` chegar a 0. É idempotente — foto já
 * baixada é pulada, e falha de download preserva a URL original.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const denied = checkCronSecret(url.searchParams.get("secret"));
  if (denied) return denied;

  const limit      = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 20)));
  const propertyId = url.searchParams.get("propertyId");

  const props = await prisma.property.findMany(
    propertyId ? { where: { id: propertyId } } : undefined
  );

  let baixadas = 0;
  let falhas   = 0;
  let restantes = 0;
  const report: { property: string; baixadas: number; falhas: number; pendentes: number }[] = [];

  for (const prop of props) {
    const fotos = parseFotos((prop as unknown as Record<string, unknown>).photos);
    const externas = fotos.filter(f => !ehLocal(f));

    if (externas.length === 0) {
      report.push({ property: prop.name, baixadas: 0, falhas: 0, pendentes: 0 });
      continue;
    }

    const dir = path.join(process.cwd(), "prisma", "uploads", prop.id);
    await mkdir(dir, { recursive: true });

    const novas: string[] = [];
    let baixadasProp = 0;
    let falhasProp   = 0;

    for (const foto of fotos) {
      // já local, ou cota do lote esgotada: mantém como está
      if (ehLocal(foto) || baixadas >= limit) {
        novas.push(foto);
        continue;
      }

      try {
        const res = await fetch(foto, { signal: AbortSignal.timeout(20_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const buffer   = Buffer.from(await res.arrayBuffer());
        const filename = `airbnb-${Date.now()}-${Math.random().toString(36).slice(2)}.${extDaUrl(foto)}`;
        await writeFile(path.join(dir, filename), buffer);

        novas.push(`/api/files/${prop.id}/${filename}`);
        baixadas++;
        baixadasProp++;
      } catch (e) {
        // preserva a URL original — melhor foto do Airbnb do que foto nenhuma
        console.error(`[import-fotos] falhou ${foto}:`, e instanceof Error ? e.message : e);
        novas.push(foto);
        falhas++;
        falhasProp++;
      }
    }

    const pendentes = novas.filter(f => !ehLocal(f)).length;
    restantes += pendentes;

    if (baixadasProp > 0) {
      const capaAntiga = (prop as unknown as Record<string, unknown>).coverPhoto as string | null;
      const idxCapa    = capaAntiga ? fotos.indexOf(capaAntiga) : -1;

      await prisma.property.update({
        where: { id: prop.id },
        data: {
          photos: JSON.stringify(novas),
          // a capa acompanha a foto que ela apontava; se não estava na lista, mantém
          coverPhoto: idxCapa >= 0 ? novas[idxCapa] : (capaAntiga ?? novas[0]),
        },
      });
    }

    report.push({
      property:  prop.name,
      baixadas:  baixadasProp,
      falhas:    falhasProp,
      pendentes,
    });
  }

  return NextResponse.json({
    ok: true,
    baixadas,
    falhas,
    restantes,
    concluido: restantes === 0,
    report,
  });
}
