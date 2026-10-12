import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PROJECT_EMAILS } from "@/lib/erp/projectEmails";

export const dynamic = "force-dynamic";

/** How long the Email Log keeps each email. */
const KEEP_DAYS = 180;

/**
 * Runs daily (see vercel.json). Deletes Email Log rows older than KEEP_DAYS,
 * except emails about a project: those are the project's record of who was
 * told what (its Communications tab) and are kept.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  const { count } = await prisma.emailLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      // "Not a project email" alone would skip rows with no link at all.
      OR: [{ link: null }, { NOT: PROJECT_EMAILS }],
    },
  });
  return NextResponse.json({ deleted: count });
}
