import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { getErpAuth, canOverridePto, canOverrideBackgroundCheck } from "@/lib/erpAuth";
import { appUrl, resolveWorkerContact, sendDayInvite } from "@/lib/erp/scheduleInvites";

const CO_STATUS_EXCLUDED = ["REJECTED", "VOID"];

/** Exactly one of employeeId/contractorId is ever set per row, this builds
 * the right upsert shape (and compound-unique key) for whichever it is. */
function workerUpsertArgs(
  changeOrderId: string,
  date: Date,
  employeeId: string | null,
  contractorId: string | null
): Prisma.ChangeOrderWorkerDayAssignmentUpsertArgs {
  if (employeeId) {
    return {
      where: { changeOrderId_employeeId_date: { changeOrderId, employeeId, date } },
      create: { changeOrderId, employeeId, date },
      update: {},
    };
  }
  return {
    where: { changeOrderId_contractorId_date: { changeOrderId, contractorId: contractorId!, date } },
    create: { changeOrderId, contractorId, date },
    update: {},
  };
}

// Plans a worker (Employee or Contractor) onto a change order for one day —
// same idea as /api/erp/schedule/worker-assignments but scoped to a
// ProjectChangeOrder instead of the parent Project. No series/repeat, COs
// are assigned one day at a time for now.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const changeOrderId = String(body.changeOrderId || "").trim();
  const employeeId = String(body.employeeId || "").trim() || null;
  const contractorId = String(body.contractorId || "").trim() || null;
  const dateRaw = String(body.date || "").trim();
  if (!changeOrderId) return NextResponse.json({ error: "changeOrderId is required" }, { status: 400 });
  if (!employeeId && !contractorId) {
    return NextResponse.json({ error: "employeeId or contractorId is required" }, { status: 400 });
  }
  if (employeeId && contractorId) {
    return NextResponse.json({ error: "Only one of employeeId or contractorId may be set" }, { status: 400 });
  }
  if (!dateRaw) return NextResponse.json({ error: "date is required" }, { status: 400 });
  const date = new Date(`${dateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  // Fetched once up front and reused by both the background-check gate below
  // and the PTO gate further down, same shared override role set the
  // project worker-assignments route uses.
  const auth = await getErpAuth();

  const [changeOrder, employee, contractor] = await Promise.all([
    prisma.projectChangeOrder.findUnique({
      where: { id: changeOrderId },
      select: {
        id: true,
        status: true,
        title: true,
        projectId: true,
        project: {
          select: {
            jobTitle: true,
            building: { select: { address: true } },
            workOrderRecord: { select: { siteAddress: true } },
          },
        },
      },
    }),
    employeeId
      ? prisma.employee.findUnique({
          where: { id: employeeId },
          select: { id: true, firstName: true, lastName: true, backgroundCheckStatus: true },
        })
      : null,
    contractorId
      ? prisma.contractor.findUnique({
          where: { id: contractorId },
          select: { id: true, name: true, backgroundCheckStatus: true },
        })
      : null,
  ]);
  if (!changeOrder) return NextResponse.json({ error: "Change order not found" }, { status: 404 });
  if (CO_STATUS_EXCLUDED.includes(changeOrder.status)) {
    return NextResponse.json({ error: "This change order can't be scheduled" }, { status: 400 });
  }
  const worker = employeeId ? employee : contractor;
  if (!worker) return NextResponse.json({ error: employeeId ? "Employee not found" : "Contractor not found" }, { status: 404 });
  const workerName = employee ? `${employee.firstName} ${employee.lastName}` : contractor?.name;
  if (worker.backgroundCheckStatus === "FAILED" && (!auth || !canOverrideBackgroundCheck(auth.role))) {
    return NextResponse.json(
      { error: `${workerName} failed their background check and can't be assigned. A PM or Admin can override.` },
      { status: 409 }
    );
  }

  // A worker with time off logged on this day can't be assigned, same
  // 409-and-explain shape as the background-check guard above. PM/ADMIN/
  // SALES can override, same role set as the project route.
  if ((employeeId || contractorId) && (!auth || !canOverridePto(auth.role))) {
    const overlapWhere = { startDate: { lte: date }, endDate: { gte: date } };
    const conflictingPto = employeeId
      ? await prisma.employeeTimeOff.findFirst({ where: { employeeId, ...overlapWhere } })
      : await prisma.contractorTimeOff.findFirst({ where: { contractorId: contractorId!, ...overlapWhere } });
    if (conflictingPto) {
      return NextResponse.json(
        { error: `${workerName} has time off scheduled and can't be assigned. A PM or Admin can override.` },
        { status: 409 }
      );
    }
  }

  const assignment = await prisma.changeOrderWorkerDayAssignment.upsert(
    workerUpsertArgs(changeOrderId, date, employeeId, contractorId)
  );

  const contact = await resolveWorkerContact(employeeId, contractorId);
  if (contact) {
    const location = changeOrder.project.building?.address || changeOrder.project.workOrderRecord?.siteAddress || undefined;
    const dayAssignment = await prisma.changeOrderDayAssignment.findUnique({
      where: { changeOrderId_date: { changeOrderId, date } },
      select: { startTime: true, endTime: true },
    });
    await sendDayInvite({
      uid: `co-worker-assignment-${assignment.id}@sueep.com`,
      to: contact.email,
      attendeeName: contact.name,
      role: "Working",
      title: `${changeOrder.title} (${changeOrder.project.jobTitle})`,
      dateKey: dayKey(assignment.date),
      startTime: dayAssignment?.startTime ?? null,
      endTime: dayAssignment?.endTime ?? null,
      location,
      url: appUrl() ? `${appUrl()}/erp/projects/${changeOrder.projectId}/change-orders/${changeOrderId}` : undefined,
    });
  }

  return NextResponse.json(assignment, { status: 201 });
}
