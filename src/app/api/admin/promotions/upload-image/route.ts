import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getAuthUser } from "@/lib/auth";

// Salva no volume persistente (mesmo diretório do banco de dados)
// Servido via /api/files/promotions/...
const UPLOAD_DIR = path.join(process.cwd(), "prisma", "uploads", "promotions");

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Formato não suportado. Use JPG, PNG, WEBP, AVIF ou GIF." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const filename = `promo-${Date.now()}.${ext}`;

    await mkdir(UPLOAD_DIR, { recursive: true });
    const bytes = await file.arrayBuffer();
    await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(bytes));

    // Serve via rota /api/files/promotions/... (volume persistente)
    return NextResponse.json({ url: `/api/files/promotions/${filename}` });
  } catch (err) {
    console.error("Upload promo error:", err);
    return NextResponse.json({ error: "Erro ao salvar imagem" }, { status: 500 });
  }
}
