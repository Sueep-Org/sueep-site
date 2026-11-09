import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { requestFix } from "@/lib/erp/subReviews";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Asks the sub for fixes. Form data: items (repeated), note, onSite ("1"), files (repeated, optional) */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const result = await requestFix(id, auth, {
    items: form.getAll("items").map(String),
    note: form.get("note"),
    onSite: form.get("onSite") === "1",
    photos: await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer()))),
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
