import { NextResponse } from "next/server";

/**
 * Segredo dos endpoints de cron/admin.
 *
 * Vem SEMPRE do ambiente — não existe valor de fallback no código.
 * Um fallback versionado no repositório vale como senha real sempre que a
 * variável não estiver setada no container, então a rota prefere sair do ar
 * (503) a aceitar um segredo que está escrito no fonte.
 */
export function checkCronSecret(provided: string | null | undefined): NextResponse | null {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    console.error("[cron] CRON_SECRET não configurada — endpoint desativado");
    return NextResponse.json(
      { error: "CRON_SECRET não configurada no servidor" },
      { status: 503 }
    );
  }

  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  return null;
}
