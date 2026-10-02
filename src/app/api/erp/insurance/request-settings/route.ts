import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { GENERAL_TOKEN_KEY, NOTIFY_EMAIL_KEY, requestLinkUrl } from "@/lib/erp/coiRequests";

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

  if (typeof body.notifyEmail === "string") {
    const emails = body.notifyEmail.split(",").map((e) => e.trim()).filter(Boolean);
    if (emails.some((e) => !/^\S+@\S+\.\S+$/.test(e))) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
    if (emails.length) {
      await prisma.appSetting.upsert({ where: { key: NOTIFY_EMAIL_KEY }, update: { value: emails.join(", ") }, create: { key: NOTIFY_EMAIL_KEY, value: emails.join(", ") } });
    } else {
      await prisma.appSetting.deleteMany({ where: { key: NOTIFY_EMAIL_KEY } });
    }
  }

  let current = (await prisma.appSetting.findUnique({ where: { key: GENERAL_TOKEN_KEY } }))?.value ?? null;
  if ((body.createLink === true && !current) || body.resetLink === true) {
    current = randomBytes(18).toString("base64url");
    await prisma.appSetting.upsert({ where: { key: GENERAL_TOKEN_KEY }, update: { value: current }, create: { key: GENERAL_TOKEN_KEY, value: current } });
  }

  return NextResponse.json({ url: current ? requestLinkUrl(current) : null });
}
