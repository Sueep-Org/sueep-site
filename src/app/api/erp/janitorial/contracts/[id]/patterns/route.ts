import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parsePatternInput } from "@/lib/erp/janitorialPatternInput";

type Ctx = { params: Promise<{ id: string }> };

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

  const parsed = parsePatternInput(body, false);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { employeeId, daysOfWeek, startTime, endTime, effectiveFrom, effectiveUntil, notes } = parsed.data;

  const contract = await prisma.recurringContract.findUnique({ where: { id }, select: { id: true } });
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const pattern = await prisma.janitorialShiftPattern.create({
    data: {
      recurringContractId: id,
      employeeId: employeeId!,
      daysOfWeek: daysOfWeek!,
      startTime: startTime!,
      endTime: endTime!,
      effectiveFrom: effectiveFrom!,
      effectiveUntil: effectiveUntil ?? null,
      notes: notes ?? null,
    },
  });
  return NextResponse.json(pattern);
}
