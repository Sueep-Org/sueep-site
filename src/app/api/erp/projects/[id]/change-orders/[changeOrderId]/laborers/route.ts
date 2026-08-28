import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

const OTHER_VALUE = "__other__";

export async function POST(req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;

  const changeOrder = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
    select: { id: true },
  });
  if (!changeOrder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Resolve worker name — either from employee roster or free-text
  const employeeId = body.employeeId != null && body.employeeId !== OTHER_VALUE
    ? String(body.employeeId).trim()
    : "";

  let name: string;
  if (employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    name = `${employee.firstName} ${employee.lastName}`.trim();
  } else {
    name = String(body.workerName || "").trim();
    if (!name) return NextResponse.json({ error: "workerName is required when no employee is selected" }, { status: 400 });
  }

  // workDate
  const workDateRaw = body.workDate;
  if (typeof workDateRaw !== "string" || !workDateRaw) {
    return NextResponse.json({ error: "workDate is required" }, { status: 400 });
  }
  const workDate = new Date(`${workDateRaw}T00:00:00-05:00`);
  if (Number.isNaN(workDate.getTime())) {
    return NextResponse.json({ error: "Invalid workDate" }, { status: 400 });
  }

  // hours
  const hours = typeof body.hours === "number" ? body.hours : Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json({ error: "hours must be a positive number" }, { status: 400 });
  }

  const clockIn = typeof body.clockIn === "string" && /^\d{2}:\d{2}$/.test(body.clockIn) ? body.clockIn : null;

  // hourlyRate → cents
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

  try {
    const laborer = await prisma.$transaction(async (tx) => {
      const created = await tx.projectChangeOrderLaborer.create({
        data: {
          changeOrderId,
          employeeId: employeeId || null,
          name,
          role: body.role != null ? String(body.role).trim() || null : null,
          workDate,
          hours,
          clockIn,
          hourlyRateCents,
          taskDescription: body.taskDescription != null ? String(body.taskDescription).trim() || null : null,
        },
      });

      // Auto-set startDate on first labor log entry
      const co = await tx.projectChangeOrder.findUnique({
        where: { id: changeOrderId },
        select: { startDate: true },
      });
      if (!co?.startDate) {
        await tx.projectChangeOrder.update({
          where: { id: changeOrderId },
          data: { startDate: workDate },
        });
      }

      return created;
    });
    return NextResponse.json(laborer);
  } catch (e) {
    console.error("POST change-order laborers", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
