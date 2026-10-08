import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { QUALITY_CHECKER_ROLES, notifyQualityCheckAssigned } from "@/lib/erp/janitorialQualityChecks";

type Ctx = { params: Promise<{ id: string }> };

/** Schedules a quality check visit on this contract. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const scheduledDate = parseDateKey(body.date);
  if (!scheduledDate) return NextResponse.json({ error: "Pick a date" }, { status: 400 });
  const assignedUserId = String(body.assignedUserId ?? "").trim();
  if (!assignedUserId) return NextResponse.json({ error: "Pick who is doing the check" }, { status: 400 });

  const [contract, user] = await Promise.all([
    prisma.recurringContract.findUnique({ where: { id }, select: { id: true } }),
    prisma.erpUser.findUnique({ where: { id: assignedUserId }, select: { role: true } }),
  ]);
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if (!user || !QUALITY_CHECKER_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Quality checks are done by an Admin or Project Manager" }, { status: 400 });
  }

  const check = await prisma.janitorialQualityCheck.create({
    data: {
      recurringContractId: id,
      scheduledDate,
      assignedUserId,
      notes: body.notes ? String(body.notes).trim() || null : null,
      createdBy: auth.email,
    },
  });
  await notifyQualityCheckAssigned(check.id, auth.email);
  return NextResponse.json(check);
}
