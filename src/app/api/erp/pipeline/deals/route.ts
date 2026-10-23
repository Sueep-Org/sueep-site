import { NextResponse } from "next/server";
import { getErpAuth, canViewPipelineBoard } from "@/lib/erpAuth";
import { createDeal } from "@/lib/erp/dealCreate";
import { dealUrl, loadDealBundle } from "@/lib/erp/postConDeals";

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

/** New deal (or a clone of one) from the Deals board: creates it in HubSpot in an open stage. */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const pipeline = body?.pipeline === "janitorial" ? "janitorial" : body?.pipeline === "post-con" ? "post-con" : null;
  if (!pipeline) return NextResponse.json({ error: "Unknown pipeline." }, { status: 400 });
  const ownerId = str(body?.ownerId);
  if (ownerId && !/^\d+$/.test(ownerId)) return NextResponse.json({ error: "Pick an owner from the list." }, { status: 400 });
  const result = await createDeal({
    pipeline,
    name: typeof body?.name === "string" ? body.name : "",
    stageId: str(body?.stageId) ?? "",
    ownerId,
    company: str(body?.company),
    bidDate: str(body?.bidDate),
    walkDate: str(body?.walkDate),
    cents: num(body?.cents),
    sqft: num(body?.sqft),
    typeOfBusiness: str(body?.typeOfBusiness),
    copyFromDealId: /^\d+$/.test(str(body?.copyFromDealId) ?? "") ? str(body?.copyFromDealId) : null,
    byEmail: auth.email,
  });
  if ("error" in result) return NextResponse.json(result, { status: 400 });
  const hubId = (await loadDealBundle().catch(() => null))?.hubId ?? null;
  return NextResponse.json({ ...result, url: dealUrl(hubId, result.newDealId) });
}
