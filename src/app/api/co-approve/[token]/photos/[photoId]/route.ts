import { NextResponse } from "next/server";
import { getApprovalPhoto } from "@/lib/erp/subCoApproval";

type Ctx = { params: Promise<{ token: string; photoId: string }> };

/** Public (no login): a photo on the change order this approval link is for. Used in the email and the page. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token, photoId } = await ctx.params;
  const photo = await getApprovalPhoto(token, photoId);
  if (!photo) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
