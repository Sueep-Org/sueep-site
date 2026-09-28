import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { loadJanitorialShifts } from "@/lib/erp/janitorialScheduleServer";

/** Notes prefix marking skips made here, so "undo" only restores these
 * (not a shift skipped on its own, or one dragged to another day). */
const SKIP_DAY_PREFIX = "Day skipped";

/**
 * Skips every weekly shift on one date, e.g. a holiday, optionally only at
 * some buildings. Body { date, contractIds?: string[], reason?: string }.
 * With { restore: true } it puts back the shifts this skipped.
 * One-time shifts are left alone (they were added on purpose for that day).
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const date = parseDateKey(body.date);
  if (!date) return NextResponse.json({ error: "Pick a date" }, { status: 400 });
  const contractIds = Array.isArray(body.contractIds) ? body.contractIds.map(String).filter(Boolean) : [];
  const inScope = (contractId: string) => contractIds.length === 0 || contractIds.includes(contractId);

  if (body.restore === true) {
    const { count } = await prisma.janitorialShiftException.deleteMany({
      where: {
        date,
        kind: "CANCELLED",
        notes: { startsWith: SKIP_DAY_PREFIX },
        ...(contractIds.length ? { recurringContractId: { in: contractIds } } : {}),
      },
    });
    return NextResponse.json({ restored: count });
  }

  const reason = body.reason ? String(body.reason).trim() : "";
  const notes = reason ? `${SKIP_DAY_PREFIX}: ${reason}` : SKIP_DAY_PREFIX;
  const shifts = (await loadJanitorialShifts(date, date)).filter((s) => inScope(s.contractId));
  const toSkip = shifts.filter((s) => s.patternId && s.status !== "CANCELLED");

  await prisma.$transaction(
    toSkip.map((s) =>
      prisma.janitorialShiftException.upsert({
        where: { patternId_date: { patternId: s.patternId!, date } },
        create: { patternId: s.patternId!, date, recurringContractId: s.contractId, kind: "CANCELLED", notes },
        update: { kind: "CANCELLED", employeeId: null, startTime: null, endTime: null, notes },
      })
    )
  );

  return NextResponse.json({
    skipped: toSkip.length,
    oneTimeLeft: shifts.filter((s) => s.status === "EXTRA").length,
  });
}
