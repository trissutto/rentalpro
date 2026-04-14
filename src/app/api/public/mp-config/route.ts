import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public Key is not secret — safe to expose to the browser
export async function GET() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "mp_public_key" } });
    if (!setting?.value) {
      return NextResponse.json({ publicKey: null });
    }
    return NextResponse.json({ publicKey: setting.value.trim() });
  } catch {
    return NextResponse.json({ publicKey: null });
  }
}
