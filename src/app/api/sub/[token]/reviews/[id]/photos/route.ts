import { NextResponse } from "next/server";
import { requireSignedInSub } from "@/lib/erp/subPortalAccess";
import { saveFixPhoto } from "@/lib/erp/subReviews";
import { MAX_PHOTO_UPLOAD_BYTES } from "@/lib/erp/subPhotos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string; id: string }> };

/** One photo of the fixes for an open fix request. Form data: file */
export async function POST(req: Request, ctx: Ctx) {
  const { token, id } = await ctx.params;
  const access = await requireSignedInSub(token);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Invalid request", code: "INVALID" }, { status: 400 });
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) return NextResponse.json({ error: "Photo too large", code: "TOO_BIG" }, { status: 413 });
  const result = await saveFixPhoto(access.sub, id, Buffer.from(await file.arrayBuffer()));
  if ("error" in result) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "BAD_IMAGE" ? 415 : result.code === "TOO_BIG" ? 413 : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
