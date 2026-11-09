import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { photoBytes } from "@/lib/erp/subPhotos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** A sub's before/after photo for staff (project Sub Photos tab). ?size=thumb for the preview. */
export async function GET(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  const bytes = await photoBytes(id, size);
  if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
