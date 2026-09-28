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

  // Takes changes ({ add, remove }) rather than a whole list: the project
  // page has three separate places that can mark scope done (Labor,
  // Contractors, Work scope), each with its own copy of the list, so saving
  // a whole list let one place silently un-mark what another had just
  // marked. A full completedScopeItems list is still accepted as a fallback.
  const validValues = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && isTurnoverScopeValue(x)) : [];
  const add = validValues(body.add);
  const remove = new Set(validValues(body.remove));
  const replaceWith = Array.isArray(body.completedScopeItems) ? validValues(body.completedScopeItems) : null;
  if (!replaceWith && add.length === 0 && remove.size === 0) {
    return NextResponse.json({ error: "Send add/remove arrays (or completedScopeItems)" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id }, select: { turnoverRequestId: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.turnoverRequestId) {
    return NextResponse.json({ error: "This project has no turnover request to track scope on" }, { status: 400 });
  }
  const turnoverRequestId = project.turnoverRequestId;

  const completedScopeItems = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "TurnoverRequest" WHERE id = ${turnoverRequestId} FOR UPDATE`;
    const current = await tx.turnoverRequest.findUnique({
      where: { id: turnoverRequestId },
      select: { completedScopeItems: true },
    });
    const base = replaceWith ?? parseCompletedScopeItems(current?.completedScopeItems);
    const next = [...new Set([...base, ...add])].filter((v) => !remove.has(v));
    const updated = await tx.turnoverRequest.update({
      where: { id: turnoverRequestId },
      data: { completedScopeItems: next },
      select: { completedScopeItems: true },
    });
    return parseCompletedScopeItems(updated.completedScopeItems);
  });

  return NextResponse.json({ completedScopeItems });
}
