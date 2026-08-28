import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { createLaborEntryForProject } from "@/lib/erp/createLaborEntry";

type Ctx = { params: Promise<{ id: string }> };

type WorkerInput = {
  employeeId?: string | null;
  workerName?: string;
  role?: string | null;
  hours?: number | string;
  hourlyRateCents?: number;
  hourlyRate?: number | string;
};

type SplitResult = { projectId: string; unitNumber: string | null; workerName: string; ok: boolean; error?: string };

/**
 * Logs one worker's total hours for the day split evenly across the units
 * (Projects) they worked in this building, by creating a real LaborEntry per
 * unit through the same gating/validation as the single-project labor route
 * (createLaborEntryForProject). Best-effort per unit: one unit being blocked
 * (e.g. its quality checklist isn't done yet) doesn't stop the others.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id: buildingId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workDate = typeof body.workDate === "string" ? body.workDate : "";
  if (!workDate) return NextResponse.json({ error: "workDate is required" }, { status: 400 });

  const transportationMethod = typeof body.transportationMethod === "string" ? body.transportationMethod : "";
  if (!transportationMethod) return NextResponse.json({ error: "transportationMethod is required" }, { status: 400 });

  let totalCommuteHours: number | null = null;
  if (body.commuteHours !== undefined && body.commuteHours !== null && body.commuteHours !== "") {
    const c = Number(body.commuteHours);
    if (!Number.isFinite(c) || c < 0) return NextResponse.json({ error: "Invalid commuteHours" }, { status: 400 });
    totalCommuteHours = c;
  }

  const projectIdsRaw = Array.isArray(body.projectIds) ? body.projectIds : [];
  const projectIds = projectIdsRaw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (projectIds.length === 0) return NextResponse.json({ error: "Select at least one unit" }, { status: 400 });

  const workersRaw = Array.isArray(body.workers) ? (body.workers as WorkerInput[]) : [];
  if (workersRaw.length === 0) return NextResponse.json({ error: "Add at least one worker" }, { status: 400 });

  const buildingUnits = await prisma.project.findMany({
    where: { id: { in: projectIds }, buildingId },
    select: { id: true, turnoverRequest: { select: { unitNumber: true } } },
  });
  const validProjectIds = new Set(buildingUnits.map((u) => u.id));
  const unitNumberByProjectId = new Map(buildingUnits.map((u) => [u.id, u.turnoverRequest?.unitNumber ?? null]));
  if (projectIds.some((pid) => !validProjectIds.has(pid))) {
    return NextResponse.json({ error: "One or more selected units don't belong to this building" }, { status: 400 });
  }

  const auth = await getErpAuth();
  const perUnitCommuteHours = totalCommuteHours != null ? totalCommuteHours / projectIds.length : undefined;

  const results: SplitResult[] = [];

  for (const worker of workersRaw) {
    const workerName = String(worker.workerName || "").trim();
    if (!workerName) continue;

    const totalHours = typeof worker.hours === "number" ? worker.hours : Number(worker.hours);
    if (!Number.isFinite(totalHours) || totalHours <= 0) {
      for (const projectId of projectIds) {
        results.push({ projectId, unitNumber: unitNumberByProjectId.get(projectId) ?? null, workerName, ok: false, error: "Invalid hours" });
      }
      continue;
    }
    const perUnitHours = totalHours / projectIds.length;

    for (const projectId of projectIds) {
      const entryResult = await createLaborEntryForProject(
        projectId,
        {
          workerName,
          employeeId: worker.employeeId || null,
          role: worker.role || null,
          hours: perUnitHours,
          workDate,
          transportationMethod,
          commuteHours: perUnitCommuteHours,
          hourlyRateCents: worker.hourlyRateCents,
          hourlyRate: worker.hourlyRate,
        },
        auth,
      );
      results.push({
        projectId,
        unitNumber: unitNumberByProjectId.get(projectId) ?? null,
        workerName,
        ok: entryResult.ok,
        error: entryResult.ok ? undefined : entryResult.error,
      });
    }
  }

  const createdCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - createdCount;
  return NextResponse.json({ results, createdCount, failedCount });
}
