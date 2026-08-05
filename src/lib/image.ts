import sharp from "sharp";

/**
 * Fotos de imóvel chegam direto da câmera ou do celular — 5 a 11 MB cada.
 * Numa galeria de 35 fotos isso vira mais de 100 MB de página, que no 4G
 * simplesmente não abre. Reduzimos para a maior dimensão que a tela usa e
 * recomprimimos: o resultado fica na casa das centenas de KB, sem diferença
 * visível no site.
 */
// Medido com uma foto real do acervo (5072x3884, 11,2 MB):
//   2560px q82 → 1009 KB   ·   1920px q80 → 530 KB   ·   1600px q80 → 358 KB
// 1920/80 é o ponto de equilíbrio: 22x menor e sem diferença visível em tela
// de notebook ou celular, que é por onde o hóspede olha.
export const LARGURA_MAXIMA = 1920;
export const QUALIDADE = 80;

/** Formatos que sabemos recomprimir. Os demais passam intactos. */
const SUPORTADOS = ["jpg", "jpeg", "png", "webp", "avif"];

export function formatoSuportado(ext: string): boolean {
  return SUPORTADOS.includes(ext.toLowerCase().replace(/^\./, ""));
}

export interface ResultadoOtimizacao {
  buffer: Buffer;
  bytesAntes: number;
  bytesDepois: number;
  otimizada: boolean;
}

/**
 * Reduz e recomprime mantendo o MESMO formato do arquivo original.
 *
 * Manter o formato é proposital: os caminhos das fotos estão gravados no banco
 * e espalhados por reservas e anúncios. Trocar .jpg por .webp economizaria mais
 * alguns porcento e quebraria toda referência existente.
 *
 * Nunca devolve um arquivo maior que o original — se a recompressão não ajudar
 * (imagem já otimizada, foto pequena), devolve o buffer que entrou.
 */
export async function otimizarImagem(
  original: Buffer,
  ext: string
): Promise<ResultadoOtimizacao> {
  const formato = ext.toLowerCase().replace(/^\./, "");

  if (!formatoSuportado(formato)) {
    return {
      buffer: original,
      bytesAntes: original.length,
      bytesDepois: original.length,
      otimizada: false,
    };
  }

  try {
    let pipeline = sharp(original, { failOn: "none" })
      // withoutEnlargement: foto menor que o limite não é esticada
      .resize({ width: LARGURA_MAXIMA, withoutEnlargement: true })
      .rotate(); // respeita o EXIF de orientação antes de descartá-lo

    if (formato === "png") {
      pipeline = pipeline.png({ compressionLevel: 9, palette: true });
    } else if (formato === "webp") {
      pipeline = pipeline.webp({ quality: QUALIDADE });
    } else if (formato === "avif") {
      pipeline = pipeline.avif({ quality: QUALIDADE });
    } else {
      pipeline = pipeline.jpeg({ quality: QUALIDADE, mozjpeg: true });
    }

    const otimizado = await pipeline.toBuffer();

    if (otimizado.length >= original.length) {
      return {
        buffer: original,
        bytesAntes: original.length,
        bytesDepois: original.length,
        otimizada: false,
      };
    }

    return {
      buffer: otimizado,
      bytesAntes: original.length,
      bytesDepois: otimizado.length,
      otimizada: true,
    };
  } catch (e) {
    // Arquivo corrompido não pode derrubar um upload: guarda como veio.
    console.error("[imagem] falha ao otimizar, mantendo original:", e);
    return {
      buffer: original,
      bytesAntes: original.length,
      bytesDepois: original.length,
      otimizada: false,
    };
  }
}
