import { NextResponse } from "next/server";
import { requireSignedInSub } from "@/lib/erp/subPortalAccess";
import { parsePosition, recordCheckIn } from "@/lib/erp/subCheckIns";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Check in or out of a job today from the portal's Today tab.
 * Body: { action: "in" | "out", jobKey, latitude?, longitude?, accuracy?, crewCount?, tappedAt? }
 * tappedAt is set when the phone saved the tap without signal and is sending it now.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const access = await requireSignedInSub(token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const jobKey = typeof body?.jobKey === "string" ? body.jobKey : "";
  if (!body || (action !== "in" && action !== "out") || !/^(p|co):[\w-]+$/.test(jobKey)) {
    return NextResponse.json({ error: "Invalid request", code: "INVALID" }, { status: 400 });
  }
  const result = await recordCheckIn(access.sub, { action, jobKey, position: parsePosition(body), crewCount: body.crewCount, tappedAt: body.tappedAt });
  if ("error" in result) return NextResponse.json(result, { status: result.code === "NOT_TODAY" ? 404 : result.code === "CREW" ? 400 : 409 });
  return NextResponse.json(result);
}
