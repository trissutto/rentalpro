import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [b1, b2] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "home_banner_1" } }),
      prisma.setting.findUnique({ where: { key: "home_banner_2" } }),
    ]);
    const parse = (s: typeof b1) => s?.value ? JSON.parse(s.value) : null;
    const banners = [parse(b1), parse(b2)].filter(b => b && b.active && b.title);
    return NextResponse.json({ banners });
  } catch {
    return NextResponse.json({ banners: [] });
  }
}
