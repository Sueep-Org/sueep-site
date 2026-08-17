import { NextResponse } from "next/server";
import { resolveShiftResponseByToken, recordShiftResponse, ShiftAlreadyPassedError, SHIFT_RESPONSE_ENABLED } from "@/lib/erp/shiftResponses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/** No-login response endpoint — the token in the URL is the only credential,
 * same accepted risk bar as every other public token-gated route in this
 * codebase (employee-info, contractor-portal, candidate-portal): no CSRF
 * check, no rate limiting. The GET page above never mutates anything on its
 * own, only this POST (fired by an explicit on-page button click) does. */
export async function POST(req: Request, ctx: Ctx) {
  if (!SHIFT_RESPONSE_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { token } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be \"accept\" or \"decline\"" }, { status: 400 });
  }

  const shift = await resolveShiftResponseByToken(token);
  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const updated = await recordShiftResponse(shift.kind, shift.id, action);
    return NextResponse.json({ status: updated.status });
  } catch (e) {
    if (e instanceof ShiftAlreadyPassedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error("POST /api/shift-response/[token]", e);
    return NextResponse.json({ error: "Failed to save your response" }, { status: 500 });
  }
}
