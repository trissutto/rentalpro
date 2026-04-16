import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const PB_API = "https://api.pagseguro.com";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let rawToken: string | null = null;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "pagbank_token" } });
    rawToken = setting?.value ?? null;
  } catch {
    return NextResponse.json({
      ok: false,
      stage: "db",
      error: "Tabela de configurações não encontrada. Execute: npx prisma db push",
    });
  }

  if (!rawToken) {
    return NextResponse.json({
      ok: false,
      stage: "config",
      error: "Token não configurado. Acesse Configurações → PagBank e salve o Token.",
    });
  }

  const token = rawToken.trim();
  const tokenInfo = {
    length: token.length,
    prefix: token.slice(0, 8) + "...",
    hasSpaces: rawToken !== token,
  };

  // Test: POST /public-keys — valid endpoint for integration token validation
  let pbOk = false;
  let pbError: string | null = null;
  let pbPublicKey: string | null = null;
  try {
    const res = await fetch(`${PB_API}/public-keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "card" }),
    });
    const data = await res.json();
    if (res.ok && data.public_key) {
      pbOk = true;
      pbPublicKey = data.public_key;
    } else {
      pbError = `HTTP ${res.status}: ${data.message || data.error_messages?.map((m: {description: string}) => m.description).join(", ") || JSON.stringify(data)}`;
    }
  } catch (e) {
    pbError = `Falha de rede: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({
    ok: pbOk,
    tokenInfo,
    tests: {
      accountFetch: pbOk
        ? { ok: true, data: { publicKey: pbPublicKey?.slice(0, 40) + "..." } }
        : { ok: false, error: pbError },
    },
    recommendation: pbOk
      ? "✅ Token PagBank funcionando! Chave pública obtida com sucesso."
      : pbError?.includes("401") || pbError?.includes("Unauthorized") || pbError?.includes("403")
        ? "❌ Token inválido ou sem permissão. Verifique o Token de Integração em: PagBank → Conta → Integrações → Token."
        : "❌ Verifique o token e tente novamente.",
  });
}
