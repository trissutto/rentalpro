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

  // Test: GET /accounts — validate token by fetching account info
  let pbAccount: Record<string, unknown> | null = null;
  let pbAccountError: string | null = null;
  try {
    const res = await fetch(`${PB_API}/accounts`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      pbAccount = {
        id: data.id,
        email: data.email,
        name: data.name,
        type: data.type,
      };
    } else {
      pbAccountError = `HTTP ${res.status}: ${data.description || data.error || JSON.stringify(data)}`;
    }
  } catch (e) {
    pbAccountError = `Falha de rede: ${e instanceof Error ? e.message : String(e)}`;
  }

  const allOk = !!pbAccount;

  return NextResponse.json({
    ok: allOk,
    tokenInfo,
    tests: {
      accountFetch: pbAccount
        ? { ok: true, data: pbAccount }
        : { ok: false, error: pbAccountError },
    },
    recommendation: allOk
      ? "✅ Token PagBank funcionando! Webhook: configure /api/webhooks/pagbank no painel PagBank."
      : pbAccountError?.includes("401") || pbAccountError?.includes("Unauthorized")
        ? "❌ Token inválido. Gere um novo token em: PagBank → Conta → Token de Integração."
        : pbAccountError?.includes("403")
          ? "❌ Token sem permissão. Verifique as permissões na conta PagBank."
          : "❌ Verifique o token e tente novamente.",
  });
}
