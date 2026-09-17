import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_PROPERTY_SELECT } from "@/lib/public-property";

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const property = await prisma.property.findFirst({
    where: { slug: params.slug, active: true }, select: PUBLIC_PROPERTY_SELECT,
  });
  if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
  return NextResponse.json({ property }, { headers: { "Cache-Control": "no-store" } });
}
