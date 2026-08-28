import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const checklist = await prisma.unitTurnoverChecklist.upsert({
    where: { projectId: id },
    update: {},
    create: { projectId: id },
  });
  return NextResponse.json(checklist);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.unitTurnoverChecklist.findUnique({ where: { projectId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};

  const strFields = ["propertyName", "unitNumber", "checklistDate", "technicianNames", "startTime", "endTime", "issues", "technicianSignature", "supervisorSignature"] as const;
  for (const f of strFields) {
    if (f in body) data[f] = body[f] != null && body[f] !== "" ? String(body[f]).trim() : null;
  }

  const boolFields = ["photoBefore", "photoAfter", "addlPaintTouchUp", "addlFullRepaint", "addlCarpetCleaning", "addlMaintenanceRepair", "addlTrashOut"] as const;
  for (const f of boolFields) {
    if (f in body) data[f] = Boolean(body[f]);
  }

  if ("conditionScore" in body) {
    const v = body.conditionScore;
    data.conditionScore = v != null && v !== "" ? Math.min(10, Math.max(1, Number(v))) : null;
  }

  if ("completedItems" in body && typeof body.completedItems === "object" && body.completedItems !== null) {
    data.completedItems = body.completedItems;
  }

  if ("sectionPhotos" in body && typeof body.sectionPhotos === "object" && body.sectionPhotos !== null) {
    data.sectionPhotos = body.sectionPhotos;
  }

  const updated = await prisma.unitTurnoverChecklist.update({ where: { projectId: id }, data: data as object });
  return NextResponse.json(updated);
}
