import { prisma } from "@/lib/prisma";
import { isTurnoverScopeValue, parseCompletedScopeItems } from "@/lib/erp/turnoverScope";

const validValues = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && isTurnoverScopeValue(x)) : [];

/**
 * Add or remove finished scope items (CLEAN, PAINT, etc) on a turnover unit,
 * keyed by its project. Takes changes, not a whole list, so two places
 * marking scope at once don't undo each other; `replaceWith` is the old
 * whole-list fallback. Used by the project page (scope-items route) and the
 * schedule's Mark day complete.
 */
export async function updateCompletedScopeItems(
  projectId: string,
  changes: { add?: unknown; remove?: unknown; replaceWith?: unknown },
): Promise<{ ok: true; completedScopeItems: string[] } | { ok: false; status: number; error: string }> {
  const add = validValues(changes.add);
  const remove = new Set(validValues(changes.remove));
  const replaceWith = Array.isArray(changes.replaceWith) ? validValues(changes.replaceWith) : null;
  if (!replaceWith && add.length === 0 && remove.size === 0) {
    return { ok: false, status: 400, error: "Send add/remove arrays (or completedScopeItems)" };
  }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { turnoverRequestId: true } });
  if (!project) return { ok: false, status: 404, error: "Project not found" };
  if (!project.turnoverRequestId) {
    return { ok: false, status: 400, error: "This project has no turnover request to track scope on" };
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
  return { ok: true, completedScopeItems };
}
