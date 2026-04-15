import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

/**
 * POST /api/admin/settings/pagbank-pubkey
 * Busca a chave pública do PagBank usando o token já salvo,
 * salva na tabela settings e retorna ao frontend.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Carrega o token salvo
  const setting = await prisma.setting.findUnique({ where: { key: "pagbank_token" } });
  const token = setting?.value?.trim();
  if (!token) {
    return NextResponse.json({ error: "Token PagBank não configurado. Salve o token primeiro." }, { status: 400 });
  }

  // Chama a API do PagBank para obter a chave pública
  const pbRes = await fetch("https://api.pagseguro.com/public-keys/credit-card", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!pbRes.ok) {
    const body = await pbRes.text();
    return NextResponse.json(
      { error: `PagBank retornou ${pbRes.status}: ${body.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const data = await pbRes.json();
  // A resposta do PagBank tem o campo "public_key"
  const publicKey: string = data?.public_key ?? data?.publicKey ?? "";
  if (!publicKey) {
    return NextResponse.json({ error: "PagBank não retornou chave pública. Verifique o token." }, { status: 502 });
  }

  // Salva a chave no banco
  await prisma.setting.upsert({
    where:  { key: "pagbank_public_key" },
    update: { value: publicKey },
    create: { key: "pagbank_public_key", value: publicKey },
  });

  return NextResponse.json({ ok: true, publicKey });
}
