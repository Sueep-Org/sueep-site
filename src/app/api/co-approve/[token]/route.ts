import { NextResponse } from "next/server";
import { isApprovalToken, recordPmAnswer } from "@/lib/erp/subCoApproval";

type Ctx = { params: Promise<{ token: string }> };

/** Public (no login): the property manager's Approve / Deny on a sub change order. The link's token is the key. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isApprovalToken(token)) return NextResponse.json({ error: "This link isn't valid anymore." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { answer?: unknown; reason?: unknown } | null;
  const answer = body?.answer === "APPROVED" ? "APPROVED" : body?.answer === "DENIED" ? "DENIED" : null;
  if (!answer) return NextResponse.json({ error: "Pick Approve or Deny." }, { status: 400 });
  try {
    const result = await recordPmAnswer(token, answer, typeof body?.reason === "string" ? body.reason : null);
    return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/co-approve/[token]", e);
    return NextResponse.json({ error: "Couldn't save your answer. Try again." }, { status: 500 });
  }
}
