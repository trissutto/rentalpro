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
 * Confere os dois dígitos verificadores do CPF.
 *
 * Vale a checagem aqui porque o PagBank recusa a cobrança com CPF inválido, e
 * o erro que ele devolve é genérico — melhor avisar o hóspede na hora, com o
 * campo na frente dele, do que deixar o pagamento falhar depois.
 */
export function cpfValido(entrada: string): boolean {
  const cpf = (entrada || "").replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  // 111.111.111-11 e afins passam na conta dos dígitos, mas não são válidos
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  for (const [ate, posicao] of [[9, 10], [10, 11]] as const) {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (posicao - i);
    let digito = (soma * 10) % 11;
    if (digito === 10) digito = 0;
    if (digito !== Number(cpf[ate])) return false;
  }
  return true;
}

export interface DadosHospede {
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  guestCpf?: string | null;
}

/**
 * Monta o bloco `customer` que o PagBank exige.
 *
 * Ele rejeita a cobrança quando falta `tax_id`, e costuma exigir `phones`
 * também — daí os valores de reserva abaixo, em vez de simplesmente omitir.
 */
export function montarCustomer(hospede: DadosHospede) {
  const cpf = (hospede.guestCpf ?? "").replace(/\D/g, "");
  const telefone = (hospede.guestPhone ?? "").replace(/\D/g, "");

  // Telefone brasileiro: 2 de DDD + 8 ou 9 do número
  const temTelefone = telefone.length === 10 || telefone.length === 11;

  return {
    name: (hospede.guestName || "Hospede").slice(0, 60),
    email: hospede.guestEmail || "hospede@reservasita.com.br",
    tax_id: cpf,
    phones: [
      {
        country: "55",
        area: temTelefone ? telefone.slice(0, 2) : "13",
        number: temTelefone ? telefone.slice(2) : "999999999",
        type: "MOBILE",
      },
    ],
  };
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
