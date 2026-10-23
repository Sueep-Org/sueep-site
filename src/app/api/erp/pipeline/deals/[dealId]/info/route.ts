import { NextResponse } from "next/server";
import { getErpAuth, canEditCompanies, canViewPipelineBoard } from "@/lib/erpAuth";
import { saveDealInfo, type DealInfoChanges } from "@/lib/erp/dealInfo";

type Ctx = { params: Promise<{ dealId: string }> };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

/** Edit an open deal's owner, company, dates, amount, sq ft or priority. Writes to HubSpot. Keys left out are kept. */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { dealId } = await ctx.params;
  if (!/^\d+$/.test(dealId)) return NextResponse.json({ error: "Unknown deal." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { pipeline?: unknown; changes?: Record<string, unknown>; aliasCompanyId?: unknown } | null;
  const pipeline = body?.pipeline === "janitorial" ? "janitorial" : body?.pipeline === "post-con" ? "post-con" : null;
  if (!pipeline) return NextResponse.json({ error: "Unknown pipeline." }, { status: 400 });
  const c = body?.changes ?? {};
  const changes: DealInfoChanges = {};
  if ("ownerId" in c) changes.ownerId = str(c.ownerId);
  if ("company" in c) changes.company = str(c.company);
  if ("bidDate" in c) changes.bidDate = str(c.bidDate);
  if ("walkDate" in c) changes.walkDate = str(c.walkDate);
  if ("awardDate" in c) changes.awardDate = str(c.awardDate);
  if ("cents" in c) changes.cents = num(c.cents);
  if ("sqft" in c) changes.sqft = num(c.sqft);
  if ("priority" in c) changes.priority = str(c.priority);
  const result = await saveDealInfo({
    dealId,
    pipeline,
    changes,
    aliasCompanyId: str(body?.aliasCompanyId),
    mayEditCompanies: canEditCompanies(auth.role),
    byEmail: auth.email,
  });
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
