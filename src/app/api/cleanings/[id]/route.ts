import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const body = await req.json();
    const { status, cleanerId, notes, photos } = body;

    const updateData: Record<string, unknown> = {};
    if (status) {
      updateData.status = status;
      if (status === "IN_PROGRESS") updateData.startedAt = new Date();
      if (status === "DONE") {
        updateData.completedAt = new Date();
        // Update property status (available)
        const cleaning = await prisma.cleaning.findUnique({ where: { id: params.id } });
        if (cleaning) {
          // Could update a property "lastCleaned" field here
        }
      }
    }
    if (cleanerId !== undefined) {
      // If the ID comes from the users table (prefixed with "user_"),
      // find or create a Cleaner profile for that user first.
      let resolvedCleanerId = cleanerId;
      if (typeof cleanerId === "string" && cleanerId.startsWith("user_")) {
        const userId = cleanerId.replace("user_", "");
        const existing = await prisma.cleaner.findFirst({ where: { userId } });
        if (existing) {
          resolvedCleanerId = existing.id;
        } else {
          const userRecord = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, phone: true, specialty: true },
          });
          if (userRecord) {
            const newCleaner = await prisma.cleaner.create({
              data: {
                userId,
                name: userRecord.name,
                phone: userRecord.phone ?? "",
                region: userRecord.specialty ?? "Equipe",
              },
            });
            resolvedCleanerId = newCleaner.id;
          }
        }
      }
      updateData.cleanerId = resolvedCleanerId;
    }
    if (notes !== undefined) updateData.notes = notes;
    if (photos) updateData.photos = photos;

    const cleaning = await prisma.cleaning.update({
      where: { id: params.id },
      data: updateData,
      include: {
        property: { select: { id: true, name: true } },
        cleaner: { select: { id: true, name: true, phone: true } },
      },
    });

    return NextResponse.json({ cleaning });
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar limpeza" }, { status: 500 });
  }
}
