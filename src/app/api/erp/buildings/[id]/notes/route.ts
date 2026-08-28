import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const noteBody = String(body.body || "").trim();
  if (!noteBody) return NextResponse.json({ error: "Note cannot be empty" }, { status: 400 });

  const building = await prisma.building.findUnique({ where: { id }, select: { id: true } });
  if (!building) return NextResponse.json({ error: "Building not found" }, { status: 404 });

  // auth.uid is the Firebase UID, not ErpUser.id — resolve the actual row for attribution.
  const [currentUser, employee] = await Promise.all([
    prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } }),
    prisma.employee.findFirst({ where: { email: { equals: auth.email, mode: "insensitive" } }, select: { firstName: true, lastName: true } }),
  ]);
  const authorName = employee ? `${employee.firstName} ${employee.lastName}`.trim() : auth.email;

  const note = await prisma.buildingNote.create({
    data: {
      buildingId: id,
      body: noteBody,
      authorName,
      authorUserId: currentUser?.id ?? null,
    },
  });

  return NextResponse.json(note);
}
