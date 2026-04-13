import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

// DELETE /api/date-blocks/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    await (prisma as any).$executeRawUnsafe(
      `DELETE FROM date_blocks WHERE id = ?`,
      params.id
    );
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/date-blocks/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const sets: string[]   = [];
  const vals: unknown[]  = [];

  if (body.reason    !== undefined) { sets.push("reason = ?");    vals.push(body.reason); }
  if (body.type      !== undefined) { sets.push("type = ?");      vals.push(body.type); }
  if (body.startDate !== undefined) { sets.push("startDate = ?"); vals.push(new Date(body.startDate).toISOString()); }
  if (body.endDate   !== undefined) { sets.push("endDate = ?");   vals.push(new Date(body.endDate).toISOString()); }

  if (sets.length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  vals.push(params.id);
  try {
    await (prisma as any).$executeRawUnsafe(
      `UPDATE date_blocks SET ${sets.join(", ")} WHERE id = ?`,
      ...vals
    );
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
