import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Returns PagBank public key for client-side card encryption
export async function GET() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "pagbank_public_key" } });
    return NextResponse.json({ publicKey: setting?.value?.trim() || null });
  } catch {
    return NextResponse.json({ publicKey: null });
  }
}
