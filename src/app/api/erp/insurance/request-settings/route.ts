import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { GENERAL_TOKEN_KEY, requestLinkUrl } from "@/lib/erp/coiRequests";
import { parseEmailList } from "@/lib/notificationTypes";

/**
 * The general COI request link (for requests not tied to a project link)
 * and the email new requests are sent to. Body: { createLink?, resetLink?, notifyEmail? }
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { createLink?: unknown; resetLink?: unknown; notifyEmail?: unknown };

  // Same setting as "COI request received" on the Notifications page.
  if (typeof body.notifyEmail === "string") {
    const emails = parseEmailList(body.notifyEmail);
    if (!emails) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
    await prisma.notificationSetting.upsert({
      where: { type: "COI_REQUEST_RECEIVED" },
      update: { to: emails, updatedBy: auth.email },
      create: { type: "COI_REQUEST_RECEIVED", to: emails, updatedBy: auth.email },
    });
  }

  let current = (await prisma.appSetting.findUnique({ where: { key: GENERAL_TOKEN_KEY } }))?.value ?? null;
  if ((body.createLink === true && !current) || body.resetLink === true) {
    current = randomBytes(18).toString("base64url");
    await prisma.appSetting.upsert({ where: { key: GENERAL_TOKEN_KEY }, update: { value: current }, create: { key: GENERAL_TOKEN_KEY, value: current } });
  }

  return NextResponse.json({ url: current ? requestLinkUrl(current) : null });
}
