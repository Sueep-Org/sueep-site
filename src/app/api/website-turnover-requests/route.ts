import { NextResponse } from "next/server";
import { createWebsiteRequest } from "@/lib/erp/propertyManagerRequests";

export const runtime = "nodejs";

/** The public turnover form on sueep.com. Saves a request for staff to confirm. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  try {
    const result = await createWebsiteRequest(body, ip);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/website-turnover-requests", e);
    return NextResponse.json({ error: "Something went wrong. Please email us instead." }, { status: 500 });
  }
}
