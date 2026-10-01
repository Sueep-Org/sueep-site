import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { requestLinkUrl } from "@/lib/erp/coiRequests";

type Ctx = { params: Promise<{ id: string }> };

/** Returns this project's COI request link, creating it the first time. `{ reset: true }` replaces it so the old one stops working. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reset?: unknown };
  const project = await prisma.project.findUnique({ where: { id }, select: { coiRequestToken: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let token = project.coiRequestToken;
  if (!token || body.reset === true) {
    token = randomBytes(18).toString("base64url");
    await prisma.project.update({ where: { id }, data: { coiRequestToken: token } });
  }
  return NextResponse.json({ url: requestLinkUrl(token) });
}
