import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkCronSecret } from "@/lib/cron-auth";

/**
 * POST /api/admin/set-setting?secret=XXX
 * body: { "key": "pagbank_token", "value": "..." }
 *
 * Grava uma configuração sem depender da tela de Configurações, que hoje não
 * está persistindo o token do PagBank (o campo volta vazio depois do F5).
 *
 * A resposta NUNCA devolve o valor — só o tamanho e os primeiros caracteres,
 * o suficiente para conferir que gravou o que se esperava.
 */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(new URL(req.url).searchParams.get("secret"));
  if (denied) return denied;

  const { key, value } = (await req.json()) as { key?: string; value?: string };

  if (!key || typeof value !== "string") {
    return NextResponse.json({ error: "Envie key e value" }, { status: 400 });
  }

  // Token colado do painel costuma vir com espaço/quebra de linha no meio
  const limpo = value.replace(/\s+/g, "").replace(/^Bearer/i, "").trim();
  if (!limpo) {
    return NextResponse.json({ error: "value vazio depois da limpeza" }, { status: 400 });
  }

  await prisma.setting.upsert({
    where: { key },
    update: { value: limpo },
    create: { key, value: limpo },
  });

  return NextResponse.json({
    ok: true,
    key,
    tamanho: limpo.length,
    comeca: limpo.slice(0, 8),
  });
}
