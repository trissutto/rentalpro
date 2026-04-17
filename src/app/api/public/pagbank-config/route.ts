import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PB_API = "https://api.pagseguro.com";

// Returns PagBank public key for client-side card encryption.
// If not cached in DB, fetches from PagBank API and caches it.
export async function GET() {
  try {
    // 1. Try DB cache first
    const cached = await prisma.setting.findUnique({ where: { key: "pagbank_public_key" } });
    if (cached?.value?.trim()) {
      return NextResponse.json({ publicKey: cached.value.trim() });
    }

    // 2. Not cached — fetch from PagBank using the saved token
    const tokenSetting = await prisma.setting.findUnique({ where: { key: "pagbank_token" } });
    const token = tokenSetting?.value?.trim();
    if (!token) {
      return NextResponse.json({ publicKey: null });
    }

    const res = await fetch(`${PB_API}/public-keys`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "card" }),
    });

    if (!res.ok) {
      return NextResponse.json({ publicKey: null });
    }

    const data = await res.json();
    const publicKey = data?.public_key ?? null;

    if (publicKey) {
      // 3. Cache in DB for next time
      try {
        await prisma.setting.upsert({
          where: { key: "pagbank_public_key" },
          update: { value: publicKey },
          create: { key: "pagbank_public_key", value: publicKey },
        });
      } catch {
        // Cache save failed — still return the key
        console.error("Failed to cache pagbank_public_key");
      }
    }

    return NextResponse.json({ publicKey });
  } catch (e) {
    console.error("pagbank-config error:", e);
    return NextResponse.json({ publicKey: null });
  }
}
