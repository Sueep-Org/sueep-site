import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { parseRecipients, requestLinkUrl, sendRequestLinkEmails } from "@/lib/erp/coiRequests";

type Ctx = { params: Promise<{ id: string }> };

/** Emails this project's COI request link. Body: { to: "a@x.com, b@y.com", message? } */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { to?: unknown; message?: unknown };
  const recipients = parseRecipients(body.to);
  if ("error" in recipients) return NextResponse.json({ error: recipients.error }, { status: 400 });
  const message = typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, 2000) : null;

  const project = await prisma.project.findUnique({ where: { id }, select: { jobTitle: true, coiRequestToken: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email isn't set up here (no Resend key). Copy the link instead." }, { status: 503 });
  }

  let token = project.coiRequestToken;
  if (!token) {
    token = randomBytes(18).toString("base64url");
    await prisma.project.update({ where: { id }, data: { coiRequestToken: token } });
  }

  try {
    await sendRequestLinkEmails({ to: recipients.to, url: requestLinkUrl(token), projectTitle: project.jobTitle, message, replyTo: auth.email });
  } catch (e) {
    console.error("coi-request-link send", e);
    return NextResponse.json({ error: "Could not send the email" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent: recipients.to.length });
}
