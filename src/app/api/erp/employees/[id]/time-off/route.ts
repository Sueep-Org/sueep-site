import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  TIME_OFF_TYPES,
  TIME_OFF_NOTIFICATION_EMAIL,
  parseTimeOffDate,
  findOverlappingTimeOff,
  overlapErrorMessage,
  timeOffEntryDays,
  paidTimeOffDaysUsed,
  paidTimeOffLimitError,
} from "@/lib/erp/timeOff";
import { sendEmail, buildTimeOffLoggedEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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

  // Employees get 15 paid days off per calendar year — beyond that, further
  // time off can only be logged as Unpaid. Contractors aren't subject to
  // this (no cap check on that route).
  if (type !== "UNPAID") {
    const year = startDate.getUTCFullYear();
    const used = await paidTimeOffDaysUsed(id, year);
    const adding = timeOffEntryDays({ startDate, endDate, type });
    const limitError = paidTimeOffLimitError(used, adding, year);
    if (limitError) return NextResponse.json({ error: limitError }, { status: 400 });
  }

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
      },
    });

    try {
      await sendEmail({
        to: TIME_OFF_NOTIFICATION_EMAIL,
        subject: `Time off logged: ${employee.firstName} ${employee.lastName}`,
        html: buildTimeOffLoggedEmail({
          personName: `${employee.firstName} ${employee.lastName}`,
          personKind: "Employee",
          type,
          startDate,
          endDate,
          days: timeOffEntryDays({ startDate, endDate, type }),
          notes,
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
