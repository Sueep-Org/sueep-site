import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  TIME_OFF_TYPES,
  parseTimeOffDate,
  findOverlappingTimeOff,
  overlapErrorMessage,
  timeOffEntryDays,
  checkPaidTimeOffLimit,
  parseLimitOverride,
} from "@/lib/erp/timeOff";
import { getErpAuth } from "@/lib/erpAuth";
import { sendEmail, buildTimeOffLoggedEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = await getErpAuth();
  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true } });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const startDate = parseTimeOffDate(body.startDate);
  const endDate = parseTimeOffDate(body.endDate);
  if (!startDate) return NextResponse.json({ error: "startDate is required" }, { status: 400 });
  if (!endDate) return NextResponse.json({ error: "endDate is required" }, { status: 400 });
  if (endDate.getTime() < startDate.getTime()) {
    return NextResponse.json({ error: "endDate must be on or after startDate" }, { status: 400 });
  }

  const typeRaw = String(body.type || "VACATION").toUpperCase();
  const type = TIME_OFF_TYPES.includes(typeRaw as (typeof TIME_OFF_TYPES)[number]) ? typeRaw : "VACATION";

  // Employees get 15 paid days off per calendar year. Past that it's refused
  // unless an Admin overrides it, paid or unpaid. Contractors aren't subject
  // to this (no cap check on that route).
  const limit = await checkPaidTimeOffLimit({
    employeeId: id,
    startDate,
    endDate,
    type,
    override: parseLimitOverride(body.limitOverride),
    role: auth?.role,
  });
  if (!limit.ok) return NextResponse.json(limit.body, { status: limit.status });

  try {
    const overlap = await findOverlappingTimeOff(id, startDate, endDate);
    if (overlap) {
      return NextResponse.json({ error: overlapErrorMessage(overlap) }, { status: 409 });
    }

    const notes = body.notes ? String(body.notes).trim() : null;
    const row = await prisma.employeeTimeOff.create({
      data: {
        employeeId: id,
        startDate,
        endDate,
        type,
        notes,
        status: "PENDING",
        requestedBy: auth?.email ?? null,
        limitOverride: limit.limitOverride,
        unpaidDays: limit.unpaidDays,
      },
    });

    try {
      await sendEmail({
        type: "TIME_OFF_LOGGED",
        link: `/erp/employees/${id}`,
        subject: `Time off request: ${employee.firstName} ${employee.lastName}`,
        html: buildTimeOffLoggedEmail({
          personName: `${employee.firstName} ${employee.lastName}`,
          personKind: "Employee",
          type,
          startDate,
          endDate,
          days: timeOffEntryDays({ startDate, endDate, type }),
          notes,
          requestedBy: auth?.email ?? null,
          limitOverride: limit.limitOverride,
          unpaidDays: limit.unpaidDays,
        }),
      });
    } catch (e) {
      // Never fail the actual time-off entry over a notification hiccup.
      console.error("Failed to send time-off notification email", e);
    }

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error("POST /api/erp/employees/[id]/time-off", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
