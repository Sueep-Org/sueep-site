import { NextResponse } from "next/server";
import { canEditCompanies, canManagePipeline, getErpAuth } from "@/lib/erpAuth";
import { saveDealInfo } from "@/lib/erp/dealInfo";
import { moveDealStage } from "@/lib/erp/dealStageMove";
import { setLostReason } from "@/lib/erp/dealLostReasons";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_DEALS = 50;

type Item = { id: string; stageId: string; name: string };
export type BulkResult = { id: string; name: string; error: string | null };

/**
 * Bulk edit from the Deals table (PIPELINE_EXTRAS_PLAN Phase 8), Admin and
 * Business Manager only. Body: { pipeline, action, value, deals: [{ id, stageId, name }] }.
 * Actions: owner (value = HubSpot owner id or ""), priority (high | medium |
 * low | ""), move (value = open stage id), lost (value = lost reason).
 * Each deal goes through the same code as a single edit, one at a time, so
 * every check (re-read, closed deals, stage rules) and log still applies.
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManagePipeline(auth.role)) return NextResponse.json({ error: "Only Admins and the Business Manager can bulk edit." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { pipeline?: unknown; action?: unknown; value?: unknown; deals?: unknown } | null;
  const pipeline = body?.pipeline === "janitorial" ? "janitorial" : body?.pipeline === "post-con" ? "post-con" : null;
  if (!pipeline) return NextResponse.json({ error: "Unknown pipeline." }, { status: 400 });
  const action = body?.action;
  if (action !== "owner" && action !== "priority" && action !== "move" && action !== "lost") return NextResponse.json({ error: "Pick what to change." }, { status: 400 });
  const value = typeof body?.value === "string" ? body.value.trim() : "";
  if ((action === "move" || action === "lost") && !value) return NextResponse.json({ error: action === "move" ? "Pick a stage." : "Pick a reason." }, { status: 400 });
  const deals = (Array.isArray(body?.deals) ? body.deals : [])
    .filter((d): d is Item => !!d && typeof d.id === "string" && /^\d+$/.test(d.id) && typeof d.stageId === "string")
    .map((d) => ({ id: d.id, stageId: d.stageId, name: typeof d.name === "string" ? d.name.slice(0, 250) : d.id }));
  if (!deals.length) return NextResponse.json({ error: "Pick some deals." }, { status: 400 });
  if (deals.length > MAX_DEALS) return NextResponse.json({ error: `At most ${MAX_DEALS} deals at a time.` }, { status: 400 });

  const results: BulkResult[] = [];
  for (const d of deals) {
    let error: string | null = null;
    try {
      if (action === "owner" || action === "priority") {
        const r = await saveDealInfo({
          dealId: d.id,
          pipeline,
          changes: action === "owner" ? { ownerId: value || null } : { priority: value || null },
          aliasCompanyId: null,
          mayEditCompanies: canEditCompanies(auth.role),
          byEmail: auth.email,
        });
        if ("error" in r) error = r.error;
      } else if (action === "move") {
        // Open stages only from here: won needs the single-card confirm, lost needs a reason.
        const r = await moveDealStage({ dealId: d.id, pipeline, fromStageId: d.stageId, toStageId: value, confirmWon: false, byEmail: auth.email });
        if ("error" in r) error = r.error;
      } else {
        const r = await setLostReason({ dealId: d.id, pipeline, reasons: [value], markLost: true, winner: null, byEmail: auth.email });
        if ("error" in r) error = r.error;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Something went wrong.";
    }
    results.push({ id: d.id, name: d.name, error });
  }
  return NextResponse.json({ results });
}
