import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RequestBody = Record<string, unknown>;

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
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

  try {
    const assignment = await prisma.laborAssignment.create({
      data: {
        turnoverRequestId,
        laborerId,
        role: role || null,
        assignedDate,
        startDate,
        endDate,
      },
    });
    return NextResponse.json(assignment);
  } catch (e) {
    console.error("POST /api/erp/labor-assignments", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
