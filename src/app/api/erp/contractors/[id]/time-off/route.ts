import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  TIME_OFF_TYPES,
  TIME_OFF_NOTIFICATION_EMAIL,
  parseTimeOffDate,
  findOverlappingContractorTimeOff,
  overlapErrorMessage,
  timeOffEntryDays,
} from "@/lib/erp/timeOff";
import { sendEmail, buildTimeOffLoggedEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const contractor = await prisma.contractor.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!contractor) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });

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
  // No 15-paid-day cap here — that's an employee PTO benefit, not extended
  // to contractors (see timeOff.ts).

  try {
    const overlap = await findOverlappingContractorTimeOff(id, startDate, endDate);
    if (overlap) {
      return NextResponse.json({ error: overlapErrorMessage(overlap) }, { status: 409 });
    }

    const notes = body.notes ? String(body.notes).trim() : null;
    const row = await prisma.contractorTimeOff.create({
      data: {
        contractorId: id,
        startDate,
        endDate,
        type,
        notes,
      },
    });

    try {
      await sendEmail({
        to: TIME_OFF_NOTIFICATION_EMAIL,
        subject: `Time off logged: ${contractor.name}`,
        html: buildTimeOffLoggedEmail({
          personName: contractor.name,
          personKind: "Contractor",
          type,
          startDate,
          endDate,
          days: timeOffEntryDays({ startDate, endDate, type }),
          notes,
        }),
      });
    } catch (e) {
      console.error("Failed to send time-off notification email", e);
    }

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    console.error("POST /api/erp/contractors/[id]/time-off", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
