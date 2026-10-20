import { NextResponse } from "next/server";
import { sendSubAssignedEmail } from "@/lib/erp/scheduleInvites";
import { prisma } from "@/lib/prisma";

type RequestBody = Record<string, unknown>;

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET() {
  const assignments = await prisma.contractorAssignment.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      contractor: { select: { id: true, name: true } },
      building: { select: { id: true, name: true } },
      project: { select: { id: true, jobTitle: true } },
    },
  });
  return NextResponse.json(assignments);
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contractorId = String(body.contractorId || "").trim();
  if (!contractorId) {
    return NextResponse.json({ error: "contractorId is required" }, { status: 400 });
  }

  const buildingId = body.buildingId ? String(body.buildingId).trim() : null;
  const projectId = body.projectId ? String(body.projectId).trim() : null;
  const role = body.role != null ? String(body.role).trim() : null;
  const assignedDate = parseDate(body.assignedDate);
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  const notes = body.notes != null ? String(body.notes).trim() : null;
  const costCents = body.costCents != null && body.costCents !== "" ? Math.round(Number(body.costCents)) : null;

  try {
    const assignment = await prisma.contractorAssignment.create({
      data: {
        contractorId,
        buildingId: buildingId || null,
        projectId: projectId || null,
        role: role || null,
        assignedDate,
        startDate,
        endDate,
        notes: notes || null,
        costCents: costCents ?? null,
      },
    });
    // Tell the sub what they were put on (a job or a building), never the cost. Logged and skipped on failure.
    const [project, building] = await Promise.all([
      assignment.projectId
        ? prisma.project.findUnique({ where: { id: assignment.projectId }, select: { jobTitle: true, building: { select: { address: true } }, workOrderRecord: { select: { siteAddress: true } } } })
        : null,
      assignment.buildingId ? prisma.building.findUnique({ where: { id: assignment.buildingId }, select: { name: true, address: true } }) : null,
    ]);
    const jobTitle = project?.jobTitle ?? building?.name;
    if (jobTitle) {
      await sendSubAssignedEmail({
        contractorId,
        jobTitle,
        location: project?.building?.address || project?.workOrderRecord?.siteAddress || building?.address || null,
        role: assignment.role,
        startDate: assignment.startDate,
        endDate: assignment.endDate,
      });
    }
    return NextResponse.json(assignment);
  } catch (e) {
    console.error("POST /api/erp/contractor-assignments", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
