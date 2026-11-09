import { NextResponse } from "next/server";
import { getErpAuth, isPmLevel } from "@/lib/erpAuth";
import { ensurePortalToken, sendPortalWelcomeEmail } from "@/lib/erp/subPortalAccess";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The sub's portal link (PM, Business Manager, Admin). Body:
 * { action: "email" } emails them their link (making one if needed),
 * { action: "new" } replaces the link so the old one stops working, then emails the new one.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action === "new" ? "new" : "email";

  const c = await prisma.contractor.findUnique({ where: { id }, select: { id: true } });
  if (!c) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });

  if (action === "new") {
    await ensurePortalToken(id, true);
    await prisma.portalAccessEvent.create({ data: { contractorId: id, action: "NEW_LINK", by: auth.email } });
  }
  const result = await sendPortalWelcomeEmail(id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
