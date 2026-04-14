import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const property = await prisma.property.findUnique({
    where: { id: params.id },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      reservations: {
        where: { status: { notIn: ["CANCELLED"] } },
        orderBy: { checkIn: "desc" },
        take: 10,
      },
    },
  });

  if (!property) return NextResponse.json({ error: "Imóvel não encontrado" }, { status: 404 });
  if (user.role === "OWNER" && property.ownerId !== user.id) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Inject extra fields via raw SQL (in case Prisma client is stale)
  try {
    const extra = await prisma.$queryRawUnsafe<{ idealGuests: number; maxGuests: number; extraGuestFee: number }[]>(
      `SELECT idealGuests, maxGuests, extraGuestFee FROM properties WHERE id = ?`,
      params.id
    );
    if (extra[0]) {
      (property as Record<string, unknown>).idealGuests   = extra[0].idealGuests;
      (property as Record<string, unknown>).maxGuests     = extra[0].maxGuests;
      (property as Record<string, unknown>).extraGuestFee = extra[0].extraGuestFee;
    }
  } catch {
    // Columns don't exist yet — will be created on next PUT
  }

  return NextResponse.json({ property });
}

function parseMoney(value: string | number | undefined): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return value;
  return parseFloat(String(value).replace(/\./g, "").replace(",", ".")) || 0;
}

/** Ensure the three capacity columns exist in SQLite */
async function ensureCapacityColumns() {
  const stmts = [
    `ALTER TABLE properties ADD COLUMN idealGuests   INTEGER NOT NULL DEFAULT 2`,
    `ALTER TABLE properties ADD COLUMN maxGuests     INTEGER NOT NULL DEFAULT 6`,
    `ALTER TABLE properties ADD COLUMN extraGuestFee REAL    NOT NULL DEFAULT 0`,
  ];
  for (const sql of stmts) {
    try { await prisma.$executeRawUnsafe(sql); } catch { /* already exists */ }
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json() as Record<string, unknown>;

    // Amenidades
    let amenities = body.amenities;
    if (Array.isArray(amenities)) {
      amenities = JSON.stringify(amenities);
    } else if (typeof amenities === "string" && !amenities.startsWith("[")) {
      amenities = JSON.stringify(amenities.split(",").map((s) => s.trim()).filter(Boolean));
    }
    const rooms = JSON.stringify(Array.isArray(body.rooms) ? body.rooms : []);

    // ── 1. Save all standard Prisma fields ──────────────────────────────────
    const property = await prisma.property.update({
      where: { id: params.id },
      data: {
        ...(body.name        !== undefined && { name: String(body.name) }),
        ...(body.description !== undefined && { description: body.description ? String(body.description) : null }),
        ...(body.address     !== undefined && { address: String(body.address) }),
        ...(body.city        !== undefined && { city: String(body.city) }),
        ...(body.state       !== undefined && { state: String(body.state) }),
        ...(body.zipCode     !== undefined && { zipCode: body.zipCode ? String(body.zipCode) : null }),
        ...(body.ownerId     !== undefined && { ownerId: String(body.ownerId) }),
        ...(body.active      !== undefined && { active: Boolean(body.active) }),
        ...(body.bedrooms    !== undefined && { bedrooms: Number(body.bedrooms) }),
        ...(body.bathrooms   !== undefined && { bathrooms: Number(body.bathrooms) }),
        ...(body.capacity    !== undefined && { capacity: Number(body.capacity) }),
        ...(body.basePrice   !== undefined && { basePrice: parseMoney(body.basePrice as string) }),
        ...(body.cleaningFee    !== undefined && { cleaningFee: parseMoney(body.cleaningFee as string) }),
        ...(body.commissionRate !== undefined && { commissionRate: Number(body.commissionRate) }),
        ...(body.checkInTime    !== undefined && { checkInTime: String(body.checkInTime) }),
        ...(body.checkOutTime   !== undefined && { checkOutTime: String(body.checkOutTime) }),
        ...(body.accessInstructions !== undefined && { accessInstructions: body.accessInstructions ? String(body.accessInstructions) : null }),
        ...(body.wifiName     !== undefined && { wifiName: body.wifiName ? String(body.wifiName) : null }),
        ...(body.wifiPassword !== undefined && { wifiPassword: body.wifiPassword ? String(body.wifiPassword) : null }),
        ...(body.rules        !== undefined && { rules: body.rules ? String(body.rules) : null }),
        amenities: String(amenities ?? "[]"),
        rooms,
      },
    });

    // ── 2. Save capacity fields via raw SQL (100% reliable) ─────────────────
    if (body.idealGuests !== undefined || body.maxGuests !== undefined || body.extraGuestFee !== undefined) {
      const ig  = Number(body.idealGuests   ?? 2);
      const mg  = Number(body.maxGuests     ?? 6);
      const egf = Number(body.extraGuestFee ?? 0);

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE properties SET idealGuests = ?, maxGuests = ?, extraGuestFee = ? WHERE id = ?`,
          ig, mg, egf, params.id
        );
        // Inject into return object so client gets fresh values immediately
        (property as Record<string, unknown>).idealGuests   = ig;
        (property as Record<string, unknown>).maxGuests     = mg;
        (property as Record<string, unknown>).extraGuestFee = egf;
      } catch {
        // Columns missing — create them and retry
        await ensureCapacityColumns();
        await prisma.$executeRawUnsafe(
          `UPDATE properties SET idealGuests = ?, maxGuests = ?, extraGuestFee = ? WHERE id = ?`,
          ig, mg, egf, params.id
        );
        (property as Record<string, unknown>).idealGuests   = ig;
        (property as Record<string, unknown>).maxGuests     = mg;
        (property as Record<string, unknown>).extraGuestFee = egf;
      }
    }

    return NextResponse.json({ property });
  } catch (err) {
    console.error("Erro ao atualizar imóvel:", err);
    return NextResponse.json({ error: "Erro ao atualizar imóvel" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  await prisma.property.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
