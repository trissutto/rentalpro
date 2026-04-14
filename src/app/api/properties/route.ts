import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city");
  const active = searchParams.get("active");

  const where: Record<string, unknown> = {};
  if (city) where.city = { contains: city, mode: "insensitive" };
  if (active !== null) where.active = active === "true";

  // Owners only see their properties
  if (user.role === "OWNER") {
    where.ownerId = user.id;
  }

  const properties = await prisma.property.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { reservations: true } },
    },
    orderBy: { name: "asc" },
  });

  // Inject capacity fields via raw SQL (Prisma client may predate these columns)
  try {
    const extras = await prisma.$queryRawUnsafe<
      { id: string; idealGuests: number; maxGuests: number; extraGuestFee: number }[]
    >(`SELECT id, idealGuests, maxGuests, extraGuestFee FROM properties`);

    const extraMap = new Map(extras.map((e) => [e.id, e]));
    for (const p of properties) {
      const ex = extraMap.get(p.id);
      if (ex) {
        (p as Record<string, unknown>).idealGuests   = ex.idealGuests;
        (p as Record<string, unknown>).maxGuests     = ex.maxGuests;
        (p as Record<string, unknown>).extraGuestFee = ex.extraGuestFee;
      }
    }
  } catch {
    // Columns don't exist yet — will be created on first PUT save
  }

  return NextResponse.json({ properties });
}

// Converte valor brasileiro (vírgula) ou americano (ponto) para número
function parseMoney(value: string | number): number {
  if (typeof value === "number") return value;
  return parseFloat(String(value).replace(/\./g, "").replace(",", ".")) || 0;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role === "OWNER") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      name, address, city, state, zipCode, description,
      capacity, bedrooms, bathrooms, basePrice, cleaningFee, commissionRate,
      idealGuests, maxGuests, extraGuestFee,
      amenities, rooms, rules, ownerId, photos,
      checkInTime, checkOutTime, accessInstructions, wifiName, wifiPassword,
    } = body;

    if (!name || !address || !city || !state || !ownerId) {
      return NextResponse.json({ error: "Preencha: nome, endereço, cidade, estado e proprietário" }, { status: 400 });
    }
    if (!basePrice) {
      return NextResponse.json({ error: "Informe o preço por noite" }, { status: 400 });
    }

    // Verifica se proprietário existe
    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) {
      return NextResponse.json({ error: "Proprietário não encontrado" }, { status: 400 });
    }

    const slug = name.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const uniqueSlug = `${slug}-${Date.now()}`;

    const createData: Record<string, unknown> = {
      name, address, city, state,
      zipCode: zipCode || null,
      description: description || null,
      slug: uniqueSlug,
      capacity: Number(capacity) || 2,
      bedrooms: Number(bedrooms) || 1,
      bathrooms: Number(bathrooms) || 1,
      basePrice: parseMoney(basePrice),
      cleaningFee: parseMoney(cleaningFee),
      commissionRate: commissionRate !== undefined ? Number(commissionRate) : 10,
      amenities: JSON.stringify(
        Array.isArray(amenities)
          ? amenities
          : String(amenities || "").split(",").map((a: string) => a.trim()).filter(Boolean)
      ),
      rooms: JSON.stringify(Array.isArray(rooms) ? rooms : []),
      photos: JSON.stringify(photos || []),
      rules: rules || null,
      ownerId,
      checkInTime: checkInTime || "14:00",
      checkOutTime: checkOutTime || "12:00",
      accessInstructions: accessInstructions || null,
      wifiName: wifiName || null,
      wifiPassword: wifiPassword || null,
    };

    // New guest-capacity fields (require npx prisma db push)
    if (idealGuests !== undefined) createData.idealGuests = Number(idealGuests);
    if (maxGuests !== undefined) createData.maxGuests = Number(maxGuests);
    if (extraGuestFee !== undefined) createData.extraGuestFee = Number(extraGuestFee);

    let property;
    try {
      property = await prisma.property.create({
        data: createData as Parameters<typeof prisma.property.create>[0]["data"],
        include: { owner: { select: { id: true, name: true } } },
      });
    } catch (innerErr: unknown) {
      // Retry without new fields if db push hasn't run yet
      const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
      if (msg.includes("idealGuests") || msg.includes("maxGuests") || msg.includes("extraGuestFee")) {
        delete createData.idealGuests;
        delete createData.maxGuests;
        delete createData.extraGuestFee;
        property = await prisma.property.create({
          data: createData as Parameters<typeof prisma.property.create>[0]["data"],
          include: { owner: { select: { id: true, name: true } } },
        });
      } else {
        throw innerErr;
      }
    }

    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar imóvel:", error);
    return NextResponse.json({ error: "Erro interno ao criar imóvel. Verifique os dados." }, { status: 500 });
  }
}
