import { NextResponse } from "next/server";
import { requireSignedInSub } from "@/lib/erp/subPortalAccess";
import { deleteOwnPhoto, photoBytes } from "@/lib/erp/subPhotos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string; id: string }> };

/** One of the sub's own photos. ?size=thumb for the preview. Never changes, so the browser keeps it. */
export async function GET(req: Request, ctx: Ctx) {
  const { token, id } = await ctx.params;
  const access = await requireSignedInSub(token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  const bytes = await photoBytes(id, size, access.sub.id);
  if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

/** The sub removes a photo they took by mistake, until they check out. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { token, id } = await ctx.params;
  const access = await requireSignedInSub(token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const result = await deleteOwnPhoto(access.sub, id);
  if ("error" in result) return NextResponse.json(result, { status: result.code === "NOT_FOUND" ? 404 : 409 });
  return NextResponse.json(result);
}
