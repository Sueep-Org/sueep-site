import { NextResponse } from "next/server";
import { updateCompletedScopeItems } from "@/lib/erp/turnoverScopeServer";

type Ctx = { params: Promise<{ id: string }> };

/** Toggles which contracted scope items (CLEAN, PAINT, etc) a turnover unit
 * has actually finished, independent of the unit's overall status. Keyed by
 * projectId (not turnoverRequestId) so every project-scoped component can
 * call it without needing to look that id up itself.
 *
 * Takes changes ({ add, remove }) rather than a whole list: the project
 * page has three separate places that can mark scope done (Labor,
 * Contractors, Work scope), each with its own copy of the list, so saving
 * a whole list let one place silently un-mark what another had just
 * marked. A full completedScopeItems list is still accepted as a fallback. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await updateCompletedScopeItems(id, { add: body.add, remove: body.remove, replaceWith: body.completedScopeItems });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ completedScopeItems: result.completedScopeItems });
}
