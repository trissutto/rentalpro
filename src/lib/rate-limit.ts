/**
 * Limitador de tentativas simples, em memória.
 *
 * O login não tinha nenhuma trava: dava para tentar senha à vontade, quantas
 * vezes quisesse. Como a aplicação roda em uma réplica só, um contador em
 * memória já resolve — se um dia houver mais de uma instância, isto precisa
 * virar contador compartilhado (Redis ou tabela no banco).
 */

interface Registro {
  tentativas: number;
  primeiraTentativa: number;
  bloqueadoAte?: number;
}

const registros = new Map<string, Registro>();

/** Faxina periódica: sem isso o Map cresce para sempre com IPs antigos. */
let ultimaLimpeza = 0;
function limparAntigos(agora: number, janelaMs: number) {
  if (agora - ultimaLimpeza < 60_000) return;
  ultimaLimpeza = agora;

  for (const [chave, reg] of registros) {
    const expirado = agora - reg.primeiraTentativa > janelaMs;
    const desbloqueado = !reg.bloqueadoAte || agora > reg.bloqueadoAte;
    if (expirado && desbloqueado) registros.delete(chave);
  }
}

export interface ResultadoLimite {
  permitido: boolean;
  tentativasRestantes: number;
  esperarSegundos: number;
}

/**
 * Registra uma tentativa e diz se ela pode prosseguir.
 *
 * @param chave        identificador de quem tenta (IP, ou IP + e-mail)
 * @param maxTentativas quantas falhas cabem na janela
 * @param janelaMs     tamanho da janela
 * @param bloqueioMs   quanto tempo fica travado ao estourar
 */
export function verificarLimite(
  chave: string,
  maxTentativas = 8,
  janelaMs = 10 * 60_000,
  bloqueioMs = 15 * 60_000
): ResultadoLimite {
  const agora = Date.now();
  limparAntigos(agora, janelaMs);

  const reg = registros.get(chave);

  if (!reg) {
    registros.set(chave, { tentativas: 1, primeiraTentativa: agora });
    return { permitido: true, tentativasRestantes: maxTentativas - 1, esperarSegundos: 0 };
  }

  if (reg.bloqueadoAte && agora < reg.bloqueadoAte) {
    return {
      permitido: false,
      tentativasRestantes: 0,
      esperarSegundos: Math.ceil((reg.bloqueadoAte - agora) / 1000),
    };
  }

  // Janela vencida (ou bloqueio cumprido): recomeça a contagem
  if (agora - reg.primeiraTentativa > janelaMs || reg.bloqueadoAte) {
    registros.set(chave, { tentativas: 1, primeiraTentativa: agora });
    return { permitido: true, tentativasRestantes: maxTentativas - 1, esperarSegundos: 0 };
  }

  reg.tentativas++;

  if (reg.tentativas > maxTentativas) {
    reg.bloqueadoAte = agora + bloqueioMs;
    return {
      permitido: false,
      tentativasRestantes: 0,
      esperarSegundos: Math.ceil(bloqueioMs / 1000),
    };
  }

  return {
    permitido: true,
    tentativasRestantes: maxTentativas - reg.tentativas,
    esperarSegundos: 0,
  };
}

/** Login deu certo: zera o histórico daquela chave. */
export function limparLimite(chave: string) {
  registros.delete(chave);
}

/** IP de quem chamou, atrás do proxy do Railway/Traefik. */
export function ipDaRequisicao(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "desconhecido";
}
