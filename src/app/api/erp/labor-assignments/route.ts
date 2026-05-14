import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RequestBody = Record<string, unknown>;

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET() {
  const assignments = await prisma.laborAssignment.findMany({
    orderBy: [{ assignedDate: "desc" }],
    include: {
      turnoverRequest: { include: { building: true } },
      laborer: { select: { id: true, firstName: true, lastName: true } },
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

  const turnoverRequestId = String(body.turnoverRequestId || "").trim();
  const laborerId = String(body.laborerId || "").trim();
  if (!turnoverRequestId || !laborerId) {
    return NextResponse.json({ error: "turnoverRequestId and laborerId are required" }, { status: 400 });
  }

  const role = body.role != null ? String(body.role).trim() : null;
  const assignedDate = parseDate(body.assignedDate);
  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  const notes = body.notes != null ? String(body.notes).trim() : null;
  const materialsUsed = parseStringArray(body.materialsUsed);

  try {
    const assignment = await prisma.laborAssignment.create({
      data: {
        turnoverRequestId,
        laborerId,
        role: role || null,
        assignedDate,
        startDate,
        endDate,
        notes: notes || null,
        materialsUsed: materialsUsed.length > 0 ? materialsUsed : undefined,
      },
    });

    const turnoverRequest = await prisma.turnoverRequest.findUnique({ where: { id: turnoverRequestId } });
    if (turnoverRequest?.status === "PENDING") {
      await prisma.turnoverRequest.update({ where: { id: turnoverRequestId }, data: { status: "ASSIGNED" } });
    }

    return NextResponse.json(assignment);
  } catch (e) {
    console.error("POST /api/erp/labor-assignments", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
