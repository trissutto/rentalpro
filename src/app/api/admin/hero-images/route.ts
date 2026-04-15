import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { writeFile, mkdir, unlink, readdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const HERO_DIR = path.join(process.cwd(), "prisma", "uploads", "hero");

async function ensureDir() {
  await mkdir(HERO_DIR, { recursive: true });
}

// GET — lista imagens hero (do banco) ou fallback para arquivos
export async function GET() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "hero_images" } });
    if (setting?.value) {
      const urls: string[] = JSON.parse(setting.value);
      return NextResponse.json({ urls });
    }
    // fallback: imagens padrão embutidas
    return NextResponse.json({ urls: [
      "/hero-1.jpg", "/hero-2.jpg", "/hero-3.jpg",
      "/hero-4.jpg", "/hero-5.jpg", "/hero-6.jpg",
    ]});
  } catch {
    return NextResponse.json({ urls: [] });
  }
}

// POST — faz upload de uma nova imagem hero
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    await ensureDir();
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });

    const ext      = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const allowed  = ["jpg","jpeg","png","webp","avif","heic","heif"];
    if (!allowed.includes(ext)) return NextResponse.json({ error: "Formato não suportado" }, { status: 400 });

    const filename = `hero-${Date.now()}.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(HERO_DIR, filename), buffer);

    const url = `/api/files/hero/${filename}`;

    // Adiciona à lista salva no banco
    const setting = await prisma.setting.findUnique({ where: { key: "hero_images" } });
    const current: string[] = setting?.value ? JSON.parse(setting.value) : [];
    const updated = [...current, url];

    await prisma.setting.upsert({
      where:  { key: "hero_images" },
      create: { key: "hero_images", value: JSON.stringify(updated) },
      update: { value: JSON.stringify(updated) },
    });

    return NextResponse.json({ url, urls: updated });
  } catch (err) {
    console.error("Hero upload error:", err);
    return NextResponse.json({ error: "Erro ao fazer upload" }, { status: 500 });
  }
}

// DELETE — remove uma imagem hero
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { url } = await req.json();

    // Remove arquivo se for do nosso volume
    if (url.startsWith("/api/files/hero/")) {
      const filename = url.replace("/api/files/hero/", "");
      try { await unlink(path.join(HERO_DIR, filename)); } catch {}
    }

    // Remove da lista no banco
    const setting = await prisma.setting.findUnique({ where: { key: "hero_images" } });
    const current: string[] = setting?.value ? JSON.parse(setting.value) : [];
    const updated = current.filter(u => u !== url);

    await prisma.setting.upsert({
      where:  { key: "hero_images" },
      create: { key: "hero_images", value: JSON.stringify(updated) },
      update: { value: JSON.stringify(updated) },
    });

    return NextResponse.json({ urls: updated });
  } catch (err) {
    console.error("Hero delete error:", err);
    return NextResponse.json({ error: "Erro ao remover imagem" }, { status: 500 });
  }
}
