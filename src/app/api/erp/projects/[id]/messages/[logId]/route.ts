import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { projectEmailsWhere } from "@/lib/erp/projectEmails";

type Ctx = { params: Promise<{ id: string; logId: string }> };

/** One email from the project's history, with its full content. Read-only. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  // Same people who get the Communications tab on the project page.
  if (!auth || auth.role === "SUPERVISOR" || auth.role === "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, logId } = await ctx.params;
  const log = await prisma.emailLog.findFirst({
    where: { id: logId, ...projectEmailsWhere(id) },
    select: { id: true, createdAt: true, to: true, cc: true, replyTo: true, subject: true, status: true, error: true, html: true, hasAttachments: true, sentBy: true },
  });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const attachments = log.hasAttachments
    ? await prisma.emailAttachment.findMany({ where: { emailLogId: log.id }, orderBy: { createdAt: "asc" }, select: { id: true, filename: true, size: true } })
    : [];
  return NextResponse.json({ ...log, attachments });
}
