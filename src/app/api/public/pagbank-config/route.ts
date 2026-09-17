import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { limparToken } from "@/lib/pagbank";

export const dynamic = "force-dynamic";

const PB_API = "https://api.pagseguro.com";

// Exposes only checkout configuration. Reading it never creates or rotates
// a key on the PagBank account, which may be shared with another application.
export async function GET() {
  let cardGateway: "pagbank" | "pagarme" = "pagarme";
  let gatewayConfigLoaded = false;
  const response = (publicKey: string | null, status = 200) => NextResponse.json(
    { publicKey, cardGateway },
    { status, headers: { "Cache-Control": "no-store" } }
  );

  try {
    const settings = await prisma.setting.findMany({
      where: { key: { in: ["pagbank_public_key", "card_gateway"] } },
    });
    cardGateway = settings.find(s => s.key === "card_gateway")?.value === "pagbank"
      ? "pagbank"
      : "pagarme";
    gatewayConfigLoaded = true;
    const cached = settings.find(s => s.key === "pagbank_public_key")?.value?.trim();
    if (cached) {
      return response(cached);
    }

    // 2. Not cached — fetch from PagBank using the saved token
    const tokenSetting = await prisma.setting.findUnique({ where: { key: "pagbank_token" } });
    const token = tokenSetting?.value ? limparToken(tokenSetting.value) : undefined;
    if (!token) {
      return response(null);
    }

    const res = await fetch(`${PB_API}/public-keys/card`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return response(null);
    }

    const data = await res.json();
    const publicKey = typeof data?.public_key === "string" && data.public_key.trim()
      ? data.public_key.trim()
      : null;

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

    return response(publicKey);
  } catch {
    console.error("Unable to load PagBank checkout configuration");
    // An unavailable PagBank key must not disable the independent Pagar.me
    // checkout. A failure to read the gateway selection itself remains fatal.
    return response(null, gatewayConfigLoaded && cardGateway === "pagarme" ? 200 : 503);
  }
}
