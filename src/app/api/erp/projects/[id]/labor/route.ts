import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await prisma.laborEntry.findMany({
    where: { projectId: id },
    orderBy: { workDate: "desc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workerName = String(body.workerName || "").trim();
  if (!workerName) return NextResponse.json({ error: "workerName is required" }, { status: 400 });

  const workDateRaw = body.workDate;
  if (typeof workDateRaw !== "string" || !workDateRaw) {
    return NextResponse.json({ error: "workDate is required (ISO date)" }, { status: 400 });
  }
  const workDate = new Date(`${workDateRaw}T00:00:00-05:00`);
  if (Number.isNaN(workDate.getTime())) {
    return NextResponse.json({ error: "Invalid workDate" }, { status: 400 });
  }

  const hours = typeof body.hours === "number" ? body.hours : Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json({ error: "hours must be a positive number" }, { status: 400 });
  }

  let hourlyRateCents: number;
  if (typeof body.hourlyRateCents === "number" && Number.isFinite(body.hourlyRateCents)) {
    hourlyRateCents = Math.round(body.hourlyRateCents);
  } else if (typeof body.hourlyRate === "number" && Number.isFinite(body.hourlyRate)) {
    hourlyRateCents = dollarsToCents(body.hourlyRate);
  } else if (typeof body.hourlyRate === "string") {
    const n = Number(String(body.hourlyRate).replace(/[$,]/g, ""));
    if (!Number.isFinite(n)) return NextResponse.json({ error: "Invalid hourlyRate" }, { status: 400 });
    hourlyRateCents = dollarsToCents(n);
  } else {
    return NextResponse.json({ error: "hourlyRate or hourlyRateCents required" }, { status: 400 });
  }

  if (hourlyRateCents < 0) return NextResponse.json({ error: "Invalid rate" }, { status: 400 });

  const employeeId = body.employeeId != null ? String(body.employeeId).trim() : "";
  if (employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Location support
  const locationLatitude = body.locationLatitude != null ? parseFloat(String(body.locationLatitude)) : null;
  const locationLongitude = body.locationLongitude != null ? parseFloat(String(body.locationLongitude)) : null;
  const locationAccuracy = body.locationAccuracy != null ? parseFloat(String(body.locationAccuracy)) : null;

  try {
    const entry = await prisma.laborEntry.create({
      data: {
        projectId: id,
        employeeId: employeeId || null,
        workDate,
        workerName,
        role: body.role != null ? String(body.role).trim() || null : null,
        hours,
        hourlyRateCents,
        taskDescription: body.taskDescription != null ? String(body.taskDescription).trim() || null : null,
        locationLatitude: Number.isFinite(locationLatitude) ? locationLatitude : null,
        locationLongitude: Number.isFinite(locationLongitude) ? locationLongitude : null,
        locationAccuracy: Number.isFinite(locationAccuracy) ? locationAccuracy : null,
        lastLocationAt: (Number.isFinite(locationLatitude) && Number.isFinite(locationLongitude)) ? new Date() : null,
      },
    });
    return NextResponse.json(entry);
  } catch (e) {
    console.error("POST labor", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
