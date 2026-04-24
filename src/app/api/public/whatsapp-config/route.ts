import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  whatsapp_number: "5513996040123",
  whatsapp_message: "Olá! Gostaria de saber mais sobre as casas disponíveis.",
};

export async function GET() {
  try {
    const [numberSetting, messageSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "whatsapp_number" } }),
      prisma.setting.findUnique({ where: { key: "whatsapp_message" } }),
    ]);

    return NextResponse.json({
      whatsapp_number: numberSetting?.value?.trim() || DEFAULTS.whatsapp_number,
      whatsapp_message: messageSetting?.value?.trim() || DEFAULTS.whatsapp_message,
    });
  } catch (e) {
    console.error("whatsapp-config error:", e);
    return NextResponse.json({
      whatsapp_number: DEFAULTS.whatsapp_number,
      whatsapp_message: DEFAULTS.whatsapp_message,
    });
  }
}
