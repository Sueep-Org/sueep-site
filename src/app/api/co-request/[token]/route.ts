import { NextResponse } from "next/server";
import { isCoRequestToken, submitCoRequest, type CoRequestInput } from "@/lib/erp/subCoRequests";

type Ctx = { params: Promise<{ token: string }> };

/** Public (no login): the invite link's token is the key. Sends a sub's change order request. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isCoRequestToken(token)) return NextResponse.json({ error: "This link isn't valid anymore." }, { status: 404 });
  const body = (await req.json().catch(() => null)) as CoRequestInput | null;
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const result = await submitCoRequest(token, body);
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/co-request/[token]", e);
    return NextResponse.json({ error: "Couldn't send. Try again." }, { status: 500 });
  }
}
