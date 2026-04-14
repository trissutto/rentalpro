import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { unlink } from "fs/promises";
import path from "path";

// GET — list photos
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const property = await prisma.property.findUnique({
    where: { id: params.id },
    select: { photos: true, coverPhoto: true },
  });
  if (!property) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  let photos: string[] = [];
  try { photos = JSON.parse(property.photos); } catch { photos = []; }

  return NextResponse.json({ photos, coverPhoto: property.coverPhoto });
}

// POST — add photos (URLs already uploaded, just update DB)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { urls } = await req.json();

  const property = await prisma.property.findUnique({ where: { id: params.id }, select: { photos: true, coverPhoto: true } });
  if (!property) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  let photos: string[] = [];
  try { photos = JSON.parse(property.photos); } catch { photos = []; }

  const merged = [...new Set([...photos, ...(urls as string[])])];

  const updated = await prisma.property.update({
    where: { id: params.id },
    data: {
      photos: JSON.stringify(merged),
      coverPhoto: property.coverPhoto || merged[0] || null,
    },
    select: { photos: true, coverPhoto: true },
  });

  let updatedPhotos: string[] = [];
  try { updatedPhotos = JSON.parse(updated.photos); } catch { updatedPhotos = []; }

  return NextResponse.json({ photos: updatedPhotos, coverPhoto: updated.coverPhoto });
}

// PUT — set cover or delete a photo
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { action, url } = await req.json();

  const property = await prisma.property.findUnique({ where: { id: params.id }, select: { photos: true, coverPhoto: true } });
  if (!property) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  let photos: string[] = [];
  try { photos = JSON.parse(property.photos); } catch { photos = []; }

  if (action === "set_cover") {
    const updated = await prisma.property.update({
      where: { id: params.id },
      data: { coverPhoto: url },
      select: { photos: true, coverPhoto: true },
    });
    let p: string[] = [];
    try { p = JSON.parse(updated.photos); } catch { p = []; }
    return NextResponse.json({ photos: p, coverPhoto: updated.coverPhoto });
  }

  if (action === "delete") {
    const filtered = photos.filter((p) => p !== url);
    const newCover = property.coverPhoto === url ? (filtered[0] || null) : property.coverPhoto;

    await prisma.property.update({
      where: { id: params.id },
      data: { photos: JSON.stringify(filtered), coverPhoto: newCover },
    });

    // Delete file from disk
    try {
      const filePath = path.join(process.cwd(), "public", url);
      await unlink(filePath);
    } catch { /* file may not exist */ }

    return NextResponse.json({ photos: filtered, coverPhoto: newCover });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
