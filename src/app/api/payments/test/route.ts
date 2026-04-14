import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Read token from DB
  let rawToken: string | null = null;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "mp_access_token" } });
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
      error: "Token não configurado. Acesse Configurações → Mercado Pago e salve o Access Token.",
    });
  }

  const token = rawToken.trim();
  const tokenInfo = {
    length: token.length,
    prefix: token.slice(0, 12) + "...",
    startsWithApp: token.startsWith("APP_USR-"),
    startsWithTest: token.startsWith("TEST-"),
    hasSpaces: rawToken !== token,
  };

  // Test 1: GET /users/me — validates the token
  let mpUser: Record<string, unknown> | null = null;
  let mpUserError: string | null = null;
  try {
    const res = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      mpUser = {
        id: data.id,
        nickname: data.nickname,
        email: data.email,
        country: data.country_id,
        siteId: data.site_id,
      };
    } else {
      mpUserError = `HTTP ${res.status}: ${data.message || data.error || JSON.stringify(data)}`;
    }
  } catch (e) {
    mpUserError = `Falha de rede: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Test 2: Try creating a minimal preference (only if user fetch succeeded)
  let prefResult: Record<string, unknown> | null = null;
  let prefError: string | null = null;
  if (mpUser) {
    try {
      const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: [{ id: "test", title: "Teste", quantity: 1, currency_id: "BRL", unit_price: 1 }],
          back_urls: {
            success: "https://example.com/success",
            failure: "https://example.com/failure",
            pending: "https://example.com/pending",
          },
          external_reference: "TEST_DIAG",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        prefResult = { id: data.id, initPoint: data.init_point };
      } else {
        prefError = `HTTP ${res.status}: ${data.message || data.error || JSON.stringify(data)}`;
      }
    } catch (e) {
      prefError = `Falha de rede: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const allOk = !!mpUser && !!prefResult;

  return NextResponse.json({
    ok: allOk,
    tokenInfo,
    tests: {
      userFetch: mpUser ? { ok: true, data: mpUser } : { ok: false, error: mpUserError },
      preferenceCreate: prefResult
        ? { ok: true, data: prefResult }
        : mpUser
          ? { ok: false, error: prefError }
          : { ok: false, error: "Pulado — token inválido" },
    },
    recommendation: allOk
      ? "✅ Credenciais funcionando! Se pagamentos ainda falham, verifique a URL de notificação."
      : mpUserError?.includes("UNAUTHORIZED") || mpUserError?.includes("401")
        ? "❌ Token inválido ou sem permissão. Gere um novo token em: Mercado Pago → Seu negócio → Credenciais."
        : mpUserError?.includes("403")
          ? "❌ Token sem permissão para esta operação. Verifique se a conta está com identidade verificada e aplicação aprovada."
          : "❌ Verifique o token e tente novamente.",
  });
}
