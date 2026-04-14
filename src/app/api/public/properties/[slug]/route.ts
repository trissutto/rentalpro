import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const property = await prisma.property.findUnique({
    where: { slug: params.slug, active: true },
    include: { owner: { select: { name: true } } },
  });
  if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });

  // Inject capacity fields via raw SQL (Prisma client may predate these columns)
  try {
    const rows = await prisma.$queryRawUnsafe<
      { idealGuests: number; maxGuests: number; extraGuestFee: number }[]
    >(
      `SELECT idealGuests, maxGuests, extraGuestFee FROM properties WHERE id = ?`,
      property.id
    );
    if (rows[0]) {
      (property as Record<string, unknown>).idealGuests   = rows[0].idealGuests;
      (property as Record<string, unknown>).maxGuests     = rows[0].maxGuests;
      (property as Record<string, unknown>).extraGuestFee = rows[0].extraGuestFee;
    }
  } catch {
    // Columns not yet created — defaults will be used on the frontend
  }

  return NextResponse.json({ property });
}
