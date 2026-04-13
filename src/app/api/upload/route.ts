import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const formData   = await req.formData();
    const files      = formData.getAll("files") as File[];
    const propertyId = formData.get("propertyId") as string;

    if (!files.length || !propertyId) {
      return NextResponse.json({ error: "Arquivo e imóvel são obrigatórios" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads", propertyId);
    await mkdir(uploadDir, { recursive: true });

    const urls: string[] = [];

    for (const file of files) {
      const ext      = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const allowed  = ["jpg","jpeg","png","webp","heic","heif"];
      if (!allowed.includes(ext)) continue;

      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buffer   = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadDir, filename), buffer);
      urls.push(`/uploads/${propertyId}/${filename}`);
    }

    return NextResponse.json({ urls });
  } catch (err) {
    console.error("Erro no upload:", err);
    return NextResponse.json({ error: "Erro ao fazer upload" }, { status: 500 });
  }
}
