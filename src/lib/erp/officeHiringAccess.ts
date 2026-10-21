import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canSeeOfficeHiring, getErpAuth } from "@/lib/erpAuth";

/**
 * For every /api/erp/candidates/[id]/... route: office candidates (with
 * expected salaries) are hidden from roles that only get the Field tab.
 * Returns a 404 response to send back, or null when the caller may go on.
 * Field candidates keep today's access (anyone the middleware lets in).
 */
export async function officeCandidateGuard(candidateId: string): Promise<NextResponse | null> {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (canSeeOfficeHiring(auth.role)) return null;
  const row = await prisma.candidateApplication.findUnique({ where: { id: candidateId }, select: { track: true } });
  if (row?.track === "OFFICE") return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  return null;
}

/** For the job-opening routes: Admin, PM and Business Manager only. */
export async function requireOfficeHiring() {
  const auth = await getErpAuth();
  if (!auth) return { auth: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canSeeOfficeHiring(auth.role)) {
    return { auth: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { auth, error: null };
}
