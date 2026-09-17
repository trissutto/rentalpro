import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { limparToken } from "@/lib/pagbank";
import { getAuthUser } from "@/lib/auth";

const PB_API = "https://api.pagseguro.com";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

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

  const token = limparToken(rawToken);
  const tokenInfo = {
    length: token.length,
    hasSpaces: rawToken !== token,
  };

  // Validation is read-only: never rotate a key shared with another application.
  let pbOk = false;
  let pbError: string | null = null;
  let pbPublicKey: string | null = null;
  try {
    const res = await fetch(`${PB_API}/public-keys/card`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    if (res.ok && typeof data.public_key === "string" && data.public_key.trim()) {
      pbOk = true;
      const key: string = data.public_key.trim();
      pbPublicKey = key;
      // Auto-save public key to DB so payment page works immediately
      try {
        await prisma.setting.upsert({
          where: { key: "pagbank_public_key" },
          update: { value: key },
          create: { key: "pagbank_public_key", value: key },
        });
      } catch { /* ignore save error, key still returned */ }
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
