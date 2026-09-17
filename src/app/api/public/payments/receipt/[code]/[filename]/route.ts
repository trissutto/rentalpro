import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { authorizeGuestRequest } from "@/lib/guest-access";
import { receiptFilePath } from "@/lib/payment-receipts";

export async function GET(req: NextRequest, { params }: { params: { code: string; filename: string } }) {
  const denied = await authorizeGuestRequest(req, params.code, "reservation:read");
  if (denied) return denied;
  try {
    const bytes = await readFile(receiptFilePath(params.code, params.filename));
    return new NextResponse(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${params.filename}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch { return NextResponse.json({ error: "Comprovante não encontrado." }, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
