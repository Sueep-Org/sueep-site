import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { projectEmailsWhere } from "@/lib/erp/projectEmails";
import { contentDisposition } from "@/lib/contentDisposition";

type Ctx = { params: Promise<{ id: string; logId: string; attachmentId: string }> };

/** Downloads a file that was sent with one of the project's emails. */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  // Same people who can read the project's email history.
  if (!auth || auth.role === "SUPERVISOR" || auth.role === "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, logId, attachmentId } = await ctx.params;
  const file = await prisma.emailAttachment.findFirst({
    where: { id: attachmentId, emailLogId: logId, emailLog: projectEmailsWhere(id) },
    select: { data: true, filename: true },
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Always a download, never shown in the page: these are files other people may have made.
  return new NextResponse(file.data as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": contentDisposition("attachment", file.filename),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
