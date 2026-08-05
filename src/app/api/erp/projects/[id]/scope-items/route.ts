import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTurnoverScopeValue, parseCompletedScopeItems } from "@/lib/erp/turnoverScope";

type Ctx = { params: Promise<{ id: string }> };

/** Toggles which contracted scope items (CLEAN, PAINT, etc) a turnover unit
 * has actually finished, independent of the unit's overall status. Keyed by
 * projectId (not turnoverRequestId) so every project-scoped component can
 * call it without needing to look that id up itself. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.completedScopeItems)) {
    return NextResponse.json({ error: "completedScopeItems must be an array" }, { status: 400 });
  }
  const completedScopeItems = [
    ...new Set((body.completedScopeItems as unknown[]).filter((v): v is string => typeof v === "string" && isTurnoverScopeValue(v))),
  ];

  const project = await prisma.project.findUnique({ where: { id }, select: { turnoverRequestId: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.turnoverRequestId) {
    return NextResponse.json({ error: "This project has no turnover request to track scope on" }, { status: 400 });
  }

  const updated = await prisma.turnoverRequest.update({
    where: { id: project.turnoverRequestId },
    data: { completedScopeItems },
    select: { completedScopeItems: true },
  });

  return NextResponse.json({ completedScopeItems: parseCompletedScopeItems(updated.completedScopeItems) });
}
