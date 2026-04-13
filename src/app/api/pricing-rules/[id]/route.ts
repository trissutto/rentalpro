import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const rule = await prisma.pricingRule.update({
    where: { id: params.id },
    data: {
      name: body.name,
      type: body.type,
      daysOfWeek: body.daysOfWeek ? JSON.stringify(body.daysOfWeek) : null,
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      priceType: body.priceType,
      value: Number(body.value),
      priority: Number(body.priority) || 0,
      active: body.active !== undefined ? body.active : true,
    },
  });

  return NextResponse.json({ rule });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  await prisma.pricingRule.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
