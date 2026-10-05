/**
 * Fotos tiradas de cada item do inventário (geladeira, TV, jogo de pratos)
 * para conferir o estado entre uma hospedagem e outra.
 *
 * Este arquivo roda no navegador e no servidor — nada de sharp ou fs aqui.
 * A conversão da imagem fica em lib/image.ts (gerarFotoInventario).
 */
export const MAX_FOTOS_POR_ITEM = 12;
export const MAX_BYTES_ENTRADA = 15 * 1024 * 1024;

export interface FotoInventario {
  url: string;
  thumb: string;
  at: string;
}

/** Lê o campo JSON do banco sem derrubar a tela se vier algo inesperado. */
export function lerFotos(raw: unknown): FotoInventario[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const lista = JSON.parse(raw);
    if (!Array.isArray(lista)) return [];
    return lista.filter(
      (f): f is FotoInventario =>
        !!f && typeof f.url === "string" && typeof f.thumb === "string" && typeof f.at === "string"
    );
  } catch {
    return [];
  }
}
