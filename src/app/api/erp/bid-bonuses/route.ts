import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { mondayOf } from "@/lib/erp/bidBonus";

/** Toggles paid status for one employee's bonus in a given week. verifiedBids is derived (see payroll/page.tsx), so there's nothing to create here beyond the paid flag. */
export async function PATCH(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const employeeId = String(body.employeeId || "").trim();
  const weekRaw = new Date(String(body.weekStart || ""));
  const paid = Boolean(body.paid);

  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  if (Number.isNaN(weekRaw.getTime())) return NextResponse.json({ error: "Invalid weekStart" }, { status: 400 });

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  const weekStart = new Date(`${mondayOf(weekRaw)}T00:00:00Z`);
  const paidAt = paid ? new Date() : null;

  try {
    const updated = await prisma.bidBonusEntry.upsert({
      where: { employeeId_weekStart: { employeeId, weekStart } },
      create: { employeeId, weekStart, paidAt },
      update: { paidAt },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/erp/bid-bonuses", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
