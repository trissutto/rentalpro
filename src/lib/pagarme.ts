import { prisma } from "./prisma";

const PAGARME_API = "https://api.pagar.me/core/v5";

/**
 * Pagar.me cobre o CARTÃO no Reservas Ita — o PagBank atende só PIX.
 *
 * Usamos o "checkout link": o Pagar.me hospeda a página de pagamento e o
 * hóspede é levado até lá. Assim os dados do cartão nunca passam pelo nosso
 * site, o que tira do caminho toda a exigência de tokenização no navegador.
 *
 * Autenticação é Basic com a chave secreta no lugar do usuário e senha vazia.
 */
function cabecalhos(apiKey: string) {
  const basic = Buffer.from(`${apiKey}:`).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/json",
  };
}

export async function lerChavePagarme(): Promise<string | null> {
  const s = await prisma.setting.findUnique({ where: { key: "pagarme_api_key" } });
  const chave = (s?.value ?? "").replace(/\s+/g, "");
  return chave || null;
}

/** `sk_test_...` é ambiente de teste; `sk_...` é dinheiro de verdade. */
export function ehChaveDeTeste(apiKey: string): boolean {
  return apiKey.startsWith("sk_test_");
}

export interface DadosCobranca {
  referencia: string;
  valorReais: number;
  nome: string;
  email: string;
  cpf: string;
  telefone?: string | null;
  descricao: string;
  /** Parcelas sem juros. O total é o mesmo em qualquer parcela. */
  maxParcelas?: number;
  urlRetorno: string;
}

export interface LinkCriado {
  orderId: string;
  paymentUrl: string;
  expiraEm: Date;
}

/** Quebra o telefone em DDD + número, como a API espera. */
function separarTelefone(bruto?: string | null) {
  const d = (bruto ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return { area: d.slice(2, 4), numero: d.slice(4) };
  if (d.length === 10 || d.length === 11) return { area: d.slice(0, 2), numero: d.slice(2) };
  return { area: "13", numero: "999999999" };
}

export async function criarLinkCartao(
  apiKey: string,
  dados: DadosCobranca
): Promise<LinkCriado> {
  const centavos = Math.round(dados.valorReais * 100);
  const validadeMin = 1440; // 24h para o hóspede concluir
  const maxParcelas = Math.max(1, Math.min(12, dados.maxParcelas ?? 6));
  const tel = separarTelefone(dados.telefone);

  const body = {
    items: [
      {
        amount: centavos,
        description: dados.descricao.slice(0, 64),
        quantity: 1,
      },
    ],
    customer: {
      name: dados.nome.slice(0, 64),
      email: dados.email,
      document: dados.cpf,
      document_type: "CPF",
      type: "individual",
      phones: {
        mobile_phone: { country_code: "55", area_code: tel.area, number: tel.numero },
      },
    },
    payments: [
      {
        payment_method: "checkout",
        checkout: {
          expires_in: validadeMin,
          default_payment_method: "credit_card",
          accepted_payment_methods: ["credit_card"],
          skip_checkout_success_page: false,
          // O hóspede não edita os próprios dados: nome e CPF vêm da reserva
          customer_editable: false,
          billing_address_editable: true,
          success_url: dados.urlRetorno,
          credit_card: {
            // Parcelas sem juros: todas somam o mesmo total
            installments: Array.from({ length: maxParcelas }, (_, i) => ({
              number: i + 1,
              total: centavos,
            })),
            statement_descriptor: "RESERVASITA",
            capture: true,
          },
        },
      },
    ],
    code: dados.referencia.slice(0, 52),
  };

  const res = await fetch(`${PAGARME_API}/orders`, {
    method: "POST",
    headers: cabecalhos(apiKey),
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detalhe =
      json?.message ||
      (json?.errors ? JSON.stringify(json.errors).slice(0, 300) : `HTTP ${res.status}`);
    throw new Error(detalhe);
  }

  const url = json?.checkouts?.[0]?.payment_url;
  if (!url) throw new Error("Pagar.me nao devolveu o link de pagamento");

  return {
    orderId: json.id,
    paymentUrl: url,
    expiraEm: new Date(Date.now() + validadeMin * 60_000),
  };
}

/** Chamada barata só para conferir se a chave é aceita. */
export async function testarChave(apiKey: string): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${PAGARME_API}/orders?size=1`, {
    method: "GET",
    headers: cabecalhos(apiKey),
  });
  return { ok: res.ok, status: res.status };
}
