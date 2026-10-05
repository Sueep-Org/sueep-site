import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSafetyEscalationEmail, buildSafetyNoticeEmail, sendEmail } from "@/lib/email";
import { SAFETY_VIOLATION_THRESHOLD } from "@/lib/erp/safetyConfig";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; checkId: string; workerId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id: projectId, checkId, workerId } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.hasVest === "boolean") data.hasVest = body.hasVest;
  if (typeof body.hasHardHat === "boolean") data.hasHardHat = body.hasHardHat;
  if (typeof body.hasBoots === "boolean") data.hasBoots = body.hasBoots;
  if (typeof body.hasUniform === "boolean") data.hasUniform = body.hasUniform;
  if (typeof body.photoUrl === "string") data.photoUrl = body.photoUrl || null;
  if (typeof body.passed === "boolean") data.passed = body.passed;
  if (typeof body.notes === "string") data.notes = body.notes.trim() || null;

  const worker = await prisma.safetyCheckWorker.update({ where: { id: workerId }, data });

  // When marked passed, auto-resolve any open incident tied to this worker entry.
  if (body.passed === true) {
    await prisma.safetyIncident.updateMany({
      where: { safetyCheckWorkerId: workerId, status: { in: ["OPEN", "ESCALATED"] } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
  }

  // Only create an incident when the supervisor explicitly marks non-compliant (nonCompliant: true).
  // Toggling passed back off does NOT re-generate an incident.
  if (body.nonCompliant === true) {
    try {
      const check = await prisma.dailySafetyCheck.findUnique({
        where: { id: checkId },
        select: { checkDate: true, projectId: true, project: { select: { jobTitle: true } } },
      });

      const employeeId = worker.employeeId ?? null;

      const existingCount = employeeId
        ? await prisma.safetyIncident.count({ where: { employeeId } })
        : await prisma.safetyIncident.count({
            where: { workerName: { equals: worker.workerName, mode: "insensitive" } },
          });

      const violationCount = existingCount + 1;
      const shouldEscalate = violationCount >= SAFETY_VIOLATION_THRESHOLD;

      const incident = await prisma.safetyIncident.create({
        data: {
          safetyCheckWorkerId: workerId,
          safetyCheckId: checkId,
          projectId,
          employeeId,
          workerName: worker.workerName,
          checkDate: check?.checkDate ?? new Date(),
          violationCount,
          status: shouldEscalate ? "ESCALATED" : "OPEN",
          escalatedAt: shouldEscalate ? new Date() : null,
        },
      });

      // Notify the employee if they have an email on file.
      if (employeeId) {
        const employee = await prisma.employee.findUnique({
          where: { id: employeeId },
          select: { email: true, firstName: true },
        });
        if (employee?.email) {
          const projectName = check?.project?.jobTitle ?? "your project";
          const checkDateStr = check?.checkDate
            ? new Date(check.checkDate).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" })
            : "today";

          await sendEmail({
            type: "SAFETY_NOTICE",
            link: `/erp/projects/${projectId}`,
            to: employee.email,
            subject: `Safety compliance notice: ${checkDateStr}`,
            html: buildSafetyNoticeEmail({
              name: employee.firstName || worker.workerName,
              projectName,
              checkDate: checkDateStr,
              violationCount,
              escalated: shouldEscalate,
              threshold: SAFETY_VIOLATION_THRESHOLD,
            }),
          });

          await prisma.safetyIncident.update({
            where: { id: incident.id },
            data: { notificationSentAt: new Date() },
          });
        }
      }

      // Escalate to Operations Management on the 3rd+ violation.
      if (shouldEscalate) {
        const projectName = check?.project?.jobTitle ?? projectId;
        const checkDateStr = check?.checkDate
          ? new Date(check.checkDate).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric", year: "numeric" })
          : "today";

        await sendEmail({
          type: "SAFETY_ESCALATION",
          link: `/erp/projects/${projectId}`,
          subject: `Safety escalation: ${worker.workerName}`,
          html: buildSafetyEscalationEmail({
            workerName: worker.workerName,
            projectName,
            checkDate: checkDateStr,
            violationCount,
            projectUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() ? `${process.env.NEXT_PUBLIC_APP_URL.trim()}/erp/projects/${projectId}` : null,
          }),
        });

        await prisma.safetyIncident.update({
          where: { id: incident.id },
          data: { escalationSentAt: new Date() },
        });
      }
    } catch (e) {
      console.error("SafetyIncident creation failed:", e);
      // Non-fatal — the worker PATCH already succeeded.
    }
  }

  return NextResponse.json(worker);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { workerId } = await params;
  await prisma.safetyCheckWorker.delete({ where: { id: workerId } });
  return NextResponse.json({ ok: true });
}
