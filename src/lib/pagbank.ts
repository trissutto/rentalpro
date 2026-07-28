import { prisma } from "./prisma";

/**
 * Limpa o Bearer Token do PagBank antes de mandar no cabeçalho.
 *
 * O painel do PagBank exibe o token quebrado em várias linhas. Ao copiar e
 * colar, vêm quebras de linha e espaços NO MEIO do valor — e um `.trim()`,
 * que só limpa as pontas, deixa passar. O resultado é a resposta
 * "Invalid credential. Review AUTHORIZATION header (unknown)", que parece
 * token errado mas é só formatação.
 *
 * Também tira um "Bearer " que a pessoa tenha colado junto, senão o cabeçalho
 * acaba com a palavra repetida.
 *
 * Mesma limpeza que o FlowOps faz — lá o pagamento funciona.
 */
export function limparToken(bruto: string): string {
  return bruto
    .replace(/\s+/g, "")
    .replace(/^Bearer/i, "")
    .trim();
}

/**
 * Lê o token do PagBank já limpo. Devolve null quando não há token cadastrado,
 * para quem chama decidir a mensagem de erro.
 */
export async function lerTokenPagBank(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: "pagbank_token" } });
  if (!setting?.value) return null;

  const token = limparToken(setting.value);
  return token || null;
}
