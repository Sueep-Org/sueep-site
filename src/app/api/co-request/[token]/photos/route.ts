import { NextResponse } from "next/server";
import { isCoRequestToken, uploadCoPhoto } from "@/lib/erp/subCoRequests";

type Ctx = { params: Promise<{ token: string }> };

/** Public (no login): one photo for a change order request, before it's sent. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!isCoRequestToken(token)) return NextResponse.json({ error: "This link isn't valid anymore." }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo" }, { status: 400 });
  try {
    const result = await uploadCoPhoto(token, file);
    return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/co-request/[token]/photos", e);
    return NextResponse.json({ error: "Upload failed. Try again." }, { status: 500 });
  }
}
