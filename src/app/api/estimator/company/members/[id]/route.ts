import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";

// Owner-only. Removing a member just clears their companyId/role back to
// unset, it doesn't delete their EstimatorUser row or Firebase account —
// they land on the same companyless "join a company" gate as a brand-new
// signup and need a fresh invite code to get back in anywhere. No
// self-removal here (no ownership transfer in v1, see
// ESTIMATOR_STORAGE_FIX_PLAN.md), and the target has to actually be in the
// caller's own company.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "OWNER" || !user.companyId) {
    return NextResponse.json({ error: "Only a company owner can remove members" }, { status: 403 });
  }

  const { id } = await params;
  if (id === user.id) return NextResponse.json({ error: "Owners can't remove themselves" }, { status: 400 });

  const target = await prisma.estimatorUser.findUnique({ where: { id } });
  if (!target || target.companyId !== user.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.estimatorUser.update({
    where: { id },
    data: { companyId: null, role: "MEMBER" },
  });

  return NextResponse.json({ ok: true });
}
