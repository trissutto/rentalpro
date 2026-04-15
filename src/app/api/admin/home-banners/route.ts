import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";

const UPLOAD_DIR = path.join(process.cwd(), "prisma", "uploads", "banners");

async function ensureDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export interface HomeBanner {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaUrl: string;
  imageUrl: string;
  bgColor: string;
  textColor: string;
  active: boolean;
}

const DEFAULT_BANNER: HomeBanner = {
  title: "", subtitle: "", ctaText: "Ver imóveis", ctaUrl: "/imoveis",
  imageUrl: "", bgColor: "#1a1a2e", textColor: "#ffffff", active: false,
};

// GET — retorna os 2 banners
export async function GET() {
  try {
    const [b1, b2] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "home_banner_1" } }),
      prisma.setting.findUnique({ where: { key: "home_banner_2" } }),
    ]);
    return NextResponse.json({
      banner1: b1?.value ? JSON.parse(b1.value) : DEFAULT_BANNER,
      banner2: b2?.value ? JSON.parse(b2.value) : DEFAULT_BANNER,
    });
  } catch {
    return NextResponse.json({ banner1: DEFAULT_BANNER, banner2: DEFAULT_BANNER });
  }
}

// POST — salva configuração de um banner (slot = "1" | "2")
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { slot, banner } = body as { slot: "1" | "2"; banner: HomeBanner };
    if (!slot || !banner) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

    const key = `home_banner_${slot}`;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(banner) },
      update: { value: JSON.stringify(banner) },
    });
    return NextResponse.json({ ok: true, banner });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro ao salvar" }, { status: 500 });
  }
}

// PUT — upload de imagem para um banner
export async function PUT(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  try {
    await ensureDir();
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const slot = formData.get("slot") as string;
    if (!file || !slot) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

    const ext      = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const allowed  = ["jpg","jpeg","png","webp","avif","heic","heif"];
    if (!allowed.includes(ext)) return NextResponse.json({ error: "Formato inválido" }, { status: 400 });

    const filename = `banner-${slot}-${Date.now()}.${ext}`;
    const buffer   = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);

    return NextResponse.json({ url: `/api/files/banners/${filename}` });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro no upload" }, { status: 500 });
  }
}
