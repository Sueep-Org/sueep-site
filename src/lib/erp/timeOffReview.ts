import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { sendEmail, buildTimeOffReviewedEmail } from "@/lib/email";
import { erpRoleForEmail, timeOffEntryDays, timeOffReviewBlock } from "@/lib/erp/timeOff";

/** Approve or deny one time off entry, for both the employee and contractor
 * review routes. Body: { decision: "APPROVED" | "DENIED", note?: string }.
 * The person who asked for it gets an email either way. */
export async function reviewTimeOff(req: Request, target: { kind: "employee" | "contractor"; personId: string; timeOffId: string }) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const decision = String(body.decision ?? "").toUpperCase();
  if (decision !== "APPROVED" && decision !== "DENIED") {
    return NextResponse.json({ error: "decision must be APPROVED or DENIED" }, { status: 400 });
  }
  const note = body.note ? String(body.note).trim() || null : null;

  const isEmployee = target.kind === "employee";
  const entry = isEmployee
    ? await prisma.employeeTimeOff.findFirst({
        where: { id: target.timeOffId, employeeId: target.personId },
        include: { employee: { select: { firstName: true, lastName: true, email: true } } },
      })
    : await prisma.contractorTimeOff.findFirst({
        where: { id: target.timeOffId, contractorId: target.personId },
        include: { contractor: { select: { name: true, email: true } } },
      });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const person =
    "employee" in entry
      ? { name: `${entry.employee.firstName} ${entry.employee.lastName}`.trim(), email: entry.employee.email }
      : { name: entry.contractor.name, email: entry.contractor.email };
  const block = timeOffReviewBlock(auth, { email: person.email, erpRole: await erpRoleForEmail(person.email) });
  if (block) return NextResponse.json({ error: block }, { status: 403 });

  const data = { status: decision, reviewedBy: auth.email, reviewedAt: new Date(), reviewNote: note };
  const row = isEmployee
    ? await prisma.employeeTimeOff.update({ where: { id: entry.id }, data })
    : await prisma.contractorTimeOff.update({ where: { id: entry.id }, data });

  if (entry.requestedBy) {
    try {
      await sendEmail({
        type: "TIME_OFF_REVIEWED",
        to: entry.requestedBy,
        link: `/erp/${isEmployee ? "employees" : "contractors"}/${target.personId}`,
        subject: `Time off ${decision === "APPROVED" ? "approved" : "denied"}: ${person.name}`,
        html: buildTimeOffReviewedEmail({
          personName: person.name,
          decision,
          type: entry.type,
          startDate: entry.startDate,
          endDate: entry.endDate,
          days: timeOffEntryDays(entry),
          reviewedBy: auth.email,
          note,
        }),
      });
    } catch (e) {
      console.error("Failed to send time-off review email", e);
    }
  }

  return NextResponse.json(row);
}
