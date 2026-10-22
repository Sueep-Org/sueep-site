import { NextResponse } from "next/server";
import { deleteCoPhoto, getCoPhoto, isCoRequestToken } from "@/lib/erp/subCoRequests";

type Ctx = { params: Promise<{ token: string; photoId: string }> };

/** Public (no login): a photo this link uploaded, or one on this sub's requests for the unit. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token, photoId } = await ctx.params;
  if (!isCoRequestToken(token)) return new NextResponse("Not found", { status: 404 });
  const photo = await getCoPhoto(token, photoId);
  if (!photo) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}

/** Removes a photo that hasn't been sent with a request yet. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { token, photoId } = await ctx.params;
  if (!isCoRequestToken(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await deleteCoPhoto(token, photoId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
