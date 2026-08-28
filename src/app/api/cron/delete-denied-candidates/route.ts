import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json). Deletes any candidate application still
 * marked DENIED 30+ days after it was submitted (createdAt, not updatedAt -
 * editing notes/paperwork on a denied candidate shouldn't push the deletion
 * out). Cascades to CandidateDocument/CandidateContract via the schema's
 * onDelete: Cascade.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await prisma.candidateApplication.deleteMany({
    where: { status: "DENIED", createdAt: { lt: cutoff } },
  });

  return NextResponse.json({ deleted: result.count, cutoff: cutoff.toISOString() });
}
