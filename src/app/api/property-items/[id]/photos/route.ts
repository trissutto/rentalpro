import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { gerarFotoInventario } from "@/lib/image";
import { lerFotos, MAX_BYTES_ENTRADA, MAX_FOTOS_POR_ITEM } from "@/lib/inventory-photos";

export const maxDuration = 60;

const include = { item: true, room: { select: { id: true, name: true, type: true } } };

function pastaDoItem(propertyItemId: string) {
  return path.join(process.cwd(), "prisma", "uploads", "inventario", propertyItemId);
}

async function autorizar(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") return null;
  return user;
}

// POST: recebe uma foto (campo "file") e anexa ao item da casa
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await autorizar(req)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const atual = await prisma.propertyItem.findUnique({ where: { id: params.id }, select: { photos: true } });
  if (!atual) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

  if (lerFotos(atual.photos).length >= MAX_FOTOS_POR_ITEM) {
    return NextResponse.json({ error: `Limite de ${MAX_FOTOS_POR_ITEM} fotos por item` }, { status: 400 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const campo = form.get("file");
    file = campo && typeof campo !== "string" ? campo : null;
  } catch {
    return NextResponse.json({ error: "Envio inválido" }, { status: 400 });
  }
  if (!file || !file.size) return NextResponse.json({ error: "Foto obrigatória" }, { status: 400 });
  if (file.size > MAX_BYTES_ENTRADA) return NextResponse.json({ error: "Foto muito grande" }, { status: 413 });
  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Envie uma imagem" }, { status: 400 });
  }

  let foto: Buffer, miniatura: Buffer;
  try {
    ({ foto, miniatura } = await gerarFotoInventario(Buffer.from(await file.arrayBuffer())));
  } catch (err) {
    console.error("[inventario] imagem ilegível:", err);
    return NextResponse.json({ error: "Não foi possível ler a imagem" }, { status: 400 });
  }

  const pasta = pastaDoItem(params.id);
  const nome = `${Date.now()}-${randomBytes(6).toString("hex")}`;
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, `${nome}.webp`), foto);
  await writeFile(path.join(pasta, `${nome}-thumb.webp`), miniatura);

  const base = `/api/files/inventario/${params.id}`;
  const nova = { url: `${base}/${nome}.webp`, thumb: `${base}/${nome}-thumb.webp`, at: new Date().toISOString() };

  // Relê na hora de gravar: duas fotos enviadas juntas não podem apagar uma à outra
  const propertyItem = await prisma.$transaction(async tx => {
    const linha = await tx.propertyItem.findUniqueOrThrow({ where: { id: params.id }, select: { photos: true } });
    return tx.propertyItem.update({
      where: { id: params.id },
      data: { photos: JSON.stringify([...lerFotos(linha.photos), nova]) },
      include,
    });
  });

  return NextResponse.json({ propertyItem, photo: nova }, { status: 201 });
}

// DELETE: remove uma foto do item ({ url } no corpo)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await autorizar(req)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  let url: unknown;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: "Envio inválido" }, { status: 400 });
  }

  const resultado = await prisma.$transaction(async tx => {
    const atual = await tx.propertyItem.findUnique({ where: { id: params.id }, select: { photos: true } });
    if (!atual) return { erro: "Item não encontrado" } as const;
    const fotos = lerFotos(atual.photos);
    const alvo = fotos.find(f => f.url === url);
    if (!alvo) return { erro: "Foto não encontrada" } as const;
    const propertyItem = await tx.propertyItem.update({
      where: { id: params.id },
      data: { photos: JSON.stringify(fotos.filter(f => f !== alvo)) },
      include,
    });
    return { propertyItem, alvo };
  });
  if ("erro" in resultado) return NextResponse.json({ error: resultado.erro }, { status: 404 });
  const { propertyItem, alvo } = resultado;

  // O banco já não aponta para os arquivos; se apagar falhar, sobra só lixo em disco
  const pasta = pastaDoItem(params.id);
  for (const u of [alvo.url, alvo.thumb]) {
    await unlink(path.join(pasta, path.basename(u))).catch(() => {});
  }

  return NextResponse.json({ propertyItem });
}
