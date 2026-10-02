import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { GENERAL_TOKEN_KEY, parseRecipients, requestLinkUrl, sendRequestLinkEmails } from "@/lib/erp/coiRequests";

/** Emails the general COI request link. Body: { to: "a@x.com, b@y.com", message? } */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { to?: unknown; message?: unknown };
  const recipients = parseRecipients(body.to);
  if ("error" in recipients) return NextResponse.json({ error: recipients.error }, { status: 400 });
  const message = typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, 2000) : null;

  const token = (await prisma.appSetting.findUnique({ where: { key: GENERAL_TOKEN_KEY } }))?.value;
  if (!token) return NextResponse.json({ error: "Create the link first" }, { status: 400 });
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email isn't set up here (no Resend key). Copy the link instead." }, { status: 503 });
  }

  try {
    await sendRequestLinkEmails({ to: recipients.to, url: requestLinkUrl(token), projectTitle: null, message, replyTo: auth.email });
  } catch (e) {
    console.error("general coi-request-link send", e);
    return NextResponse.json({ error: "Could not send the email" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent: recipients.to.length });
}
