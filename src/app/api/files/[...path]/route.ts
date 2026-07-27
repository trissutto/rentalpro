import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const MIME: Record<string, string> = {
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

const UPLOADS_DIR = path.join(process.cwd(), "prisma", "uploads");

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const partes = params.path ?? [];

    // Sem esta checagem, um pedido com `..` no caminho sai da pasta de uploads
    // e serve qualquer arquivo do container — inclusive o próprio banco.
    // O nome vem da URL e chega já decodificado, então %2f também cai aqui.
    if (partes.some(p => p === ".." || p.includes("/") || p.includes("\\"))) {
      return new NextResponse(null, { status: 400 });
    }

    const filePath = path.join(UPLOADS_DIR, ...partes);

    // Cinto e suspensório: confere que o caminho final continua dentro da pasta
    const dentroDaPasta =
      filePath === UPLOADS_DIR || filePath.startsWith(UPLOADS_DIR + path.sep);
    if (!dentroDaPasta) {
      return new NextResponse(null, { status: 400 });
    }

    const ext = partes[partes.length - 1]?.split(".").pop()?.toLowerCase() ?? "";

    // Só servimos imagem: mesmo dentro da pasta, nada de entregar outros tipos
    if (!MIME[ext]) {
      return new NextResponse(null, { status: 404 });
    }

    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": MIME[ext],
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
