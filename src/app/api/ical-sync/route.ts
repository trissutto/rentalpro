import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { ICalSyncError, readIcalSources, syncIcalUrl } from "@/lib/ical";

type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>;

async function findProperty(user: AuthUser, id: string) {
  return prisma.property.findFirst({
    where: { id, ...(user.role === "OWNER" ? { ownerId: user.id } : {}) },
    select: { id: true, icalUrls: true },
  });
}

function errorResponse(error: unknown, fallback: string, status: number) {
  return NextResponse.json(
    { error: error instanceof ICalSyncError ? error.message : fallback },
    { status: error instanceof ICalSyncError ? error.status : status },
  );
}

// POST /api/ical-sync — validates the entire feed before replacing its blocks.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { propertyId, url, label = "ical", source } = body ?? {};
  if (typeof propertyId !== "string" || !propertyId.trim() || typeof url !== "string" || !url.trim() ||
      typeof label !== "string" || (source !== undefined && typeof source !== "string")) {
    return NextResponse.json({ error: "Informe propertyId, url e identificação válidos." }, { status: 400 });
  }

  try {
    if (!await findProperty(user, propertyId)) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    const result = await syncIcalUrl(propertyId, url, label, source);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error, "Não foi possível sincronizar. Os bloqueios anteriores foram preservados.", 502);
  }
}

// GET /api/ical-sync?propertyId=X — a configuration error must not look like an empty list.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const propertyId = new URL(req.url).searchParams.get("propertyId");
  if (!propertyId) return NextResponse.json({ error: "propertyId obrigatório" }, { status: 400 });
  try {
    const property = await findProperty(user, propertyId);
    if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    return NextResponse.json({ icalUrls: readIcalSources(property.icalUrls) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Não foi possível carregar os calendários salvos.", 500);
  }
}

// DELETE /api/ical-sync — remove the saved feed and its blocks together.
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { propertyId, source } = body ?? {};
  if (typeof propertyId !== "string" || !propertyId.trim() || typeof source !== "string" || !source.trim()) {
    return NextResponse.json({ error: "propertyId e source são obrigatórios" }, { status: 400 });
  }
  try {
    if (!await findProperty(user, propertyId)) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ icalUrls: string }[]>(
        "SELECT icalUrls FROM properties WHERE id = ?", propertyId,
      );
      if (!rows.length) throw new ICalSyncError("Imóvel não encontrado.", 404);
      const urls = readIcalSources(rows[0].icalUrls).filter(entry => entry.source !== source);
      await tx.$executeRawUnsafe(
        "DELETE FROM date_blocks WHERE propertyId = ? AND type = 'ICAL' AND source = ?", propertyId, source,
      );
      await tx.$executeRawUnsafe("UPDATE properties SET icalUrls = ? WHERE id = ?", JSON.stringify(urls), propertyId);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Não foi possível remover o calendário. Os bloqueios foram preservados.", 500);
  }
}
