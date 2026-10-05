import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** How long the Email Log keeps each email. */
const KEEP_DAYS = 180;

/** Runs daily (see vercel.json). Deletes Email Log rows older than KEEP_DAYS. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  const { count } = await prisma.emailLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return NextResponse.json({ deleted: count });
}
