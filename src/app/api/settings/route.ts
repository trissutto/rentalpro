import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

const PUBLIC_KEYS = ["mp_public_key"];

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const settings = await prisma.setting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) {
    // Mask secret tokens in response
    if (s.key === "mp_access_token" && s.value) {
      map[s.key] = s.value.slice(0, 8) + "••••••••••••••••••••••••••••";
    } else {
      map[s.key] = s.value;
    }
  }
  return NextResponse.json({ settings: map });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const { key, value } = body as { key: string; value: string };

  if (!key || value === undefined) {
    return NextResponse.json({ error: "key e value obrigatórios" }, { status: 400 });
  }

  // Don't allow overwriting with masked value
  if (value.includes("••••")) {
    return NextResponse.json({ success: true, message: "Sem alteração" });
  }

  // Trim whitespace from tokens to avoid silent auth failures
  const cleanValue = value.trim();

  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value: cleanValue },
    create: { key, value: cleanValue },
  });

  return NextResponse.json({ setting });
}
