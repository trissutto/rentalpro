import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// GET /api/date-blocks?propertyId=X&from=ISO&to=ISO
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  try {
    // Build raw SQL with optional filters
    const conditions: string[] = [];
    const params: unknown[]    = [];

    if (propertyId) { conditions.push(`propertyId = ?`); params.push(propertyId); }
    if (from)       { conditions.push(`endDate >= ?`);   params.push(from); }
    if (to)         { conditions.push(`startDate <= ?`); params.push(to); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql   = `SELECT * FROM date_blocks ${where} ORDER BY startDate ASC`;

    const blocks = await (prisma as any).$queryRawUnsafe(sql, ...params);
    return NextResponse.json({ blocks: blocks ?? [] });
  } catch {
    // Table doesn't exist yet — return empty until migration runs
    return NextResponse.json({ blocks: [] });
  }
}

// POST /api/date-blocks
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { propertyId, startDate, endDate, reason, type, source } = body;

  if (!propertyId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "propertyId, startDate e endDate são obrigatórios" },
      { status: 400 }
    );
  }

  const ci = new Date(startDate);
  const co = new Date(endDate);
  if (co < ci) return NextResponse.json({ error: "endDate deve ser >= startDate" }, { status: 400 });

  const id = `blk_${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  try {
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO date_blocks (id, propertyId, startDate, endDate, reason, type, source, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      propertyId,
      ci.toISOString(),
      co.toISOString(),
      reason ?? "Bloqueio",
      type ?? "MANUAL",
      source ?? null,
      now,
    );
    return NextResponse.json({ block: { id, propertyId, startDate: ci, endDate: co } }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    if (msg.includes("no such table")) {
      return NextResponse.json(
        { error: "Tabela não encontrada. Execute: node migrate-dateblocks.js" },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
