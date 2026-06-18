import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; checkId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { checkId } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.supervisorName === "string") data.supervisorName = body.supervisorName.trim();
  if (typeof body.groupPhotoUrl === "string") data.groupPhotoUrl = body.groupPhotoUrl || null;
  if (typeof body.siteArrivalPhotoUrl === "string") data.siteArrivalPhotoUrl = body.siteArrivalPhotoUrl || null;
  if (typeof body.approvedForWork === "boolean") {
    data.approvedForWork = body.approvedForWork;
    data.approvedAt = body.approvedForWork ? new Date() : null;
  }
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;

  const check = await prisma.dailySafetyCheck.update({
    where: { id: checkId },
    data,
    include: { workers: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(check);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { checkId } = await params;
  await prisma.dailySafetyCheck.delete({ where: { id: checkId } });
  return NextResponse.json({ ok: true });
}
