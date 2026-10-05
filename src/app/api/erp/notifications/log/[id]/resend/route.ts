import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageNotifications, getErpAuth } from "@/lib/erpAuth";
import { deliverEmail } from "@/lib/email";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Sends a logged email again, exactly as it went out, to the same people. */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageNotifications(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const log = await prisma.emailLog.findUnique({ where: { id } });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!log.html) return NextResponse.json({ error: "This email's content wasn't kept, so it can't be resent" }, { status: 400 });
  if (log.hasAttachments) return NextResponse.json({ error: "Emails with attachments (like calendar invites) can't be resent from here" }, { status: 400 });

  try {
    await deliverEmail({
      type: log.type,
      to: log.to,
      cc: log.cc,
      bcc: log.bcc,
      replyTo: log.replyTo,
      subject: log.subject,
      html: log.html,
      link: log.link,
      resentFromId: log.id,
      sentBy: auth.email,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
