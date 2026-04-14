import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const propertyId = searchParams.get("propertyId");

  const rules = await prisma.pricingRule.findMany({
    where: propertyId ? { propertyId } : undefined,
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { propertyId, name, type, daysOfWeek, startDate, endDate, priceType, value, priority } = body;

  if (!propertyId || !name || !type || value === undefined) {
    return NextResponse.json({ error: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  // Support MULTIPLIER, FIXED, and PACKAGE price types
  const validPriceTypes = ["MULTIPLIER", "FIXED", "PACKAGE"];
  const finalPriceType = validPriceTypes.includes(priceType) ? priceType : "MULTIPLIER";

  const rule = await prisma.pricingRule.create({
    data: {
      propertyId,
      name,
      type,
      daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      priceType: finalPriceType,
      value: Number(value),
      priority: Number(priority) || 0,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
}
