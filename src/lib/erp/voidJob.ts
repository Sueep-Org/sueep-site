/**
 * Voids a whole job (billing status Voided, with a reason), from the
 * project's Lifecycle picker or the Remove day dialog. Each kind of job is
 * voided where its billing status really lives, so a later sync can't undo it:
 * - a turnover unit: its turnover request, which carries it to the project
 * - a job with SOV lines: every line still Not billed (billed or paid lines
 *   stay, so a partly billed job doesn't end up fully Voided)
 * - any other job: the project itself
 * Only billing changes. Calendar days, removed days and their notes are left
 * exactly as they are.
 */
import { prisma } from "@/lib/prisma";
import { normalizeBillingStatus } from "@/lib/erp/billingStatus";
import { syncProjectBillingFromRequest, syncProjectBillingFromSOV, syncSovPercentDone } from "@/lib/sovSync";

/** fullyVoided: the job is Voided now (not just some of its SOV lines) */
export type VoidJobResult = { ok: boolean; message: string; fullyVoided: boolean };

export async function voidJob(projectId: string, voidReason: string): Promise<VoidJobResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      billingStatus: true,
      turnoverRequestId: true,
      turnoverRequest: { select: { billingStatus: true } },
      sov: { select: { items: { select: { id: true, billingStatus: true } } } },
    },
  });
  if (!project) return { ok: false, message: "Job not found", fullyVoided: false };
  if (normalizeBillingStatus(project.billingStatus) === "VOIDED") return { ok: true, message: "Job was already voided", fullyVoided: true };

  if (project.turnoverRequestId) {
    const status = normalizeBillingStatus(project.turnoverRequest?.billingStatus);
    if (status === "VOIDED") {
      // The unit is voided but its project wasn't carried along
      await syncProjectBillingFromRequest(project.turnoverRequestId, "VOIDED", null, voidReason);
      return { ok: true, message: "Job voided", fullyVoided: true };
    }
    if (status !== "NOT_BILLED") return { ok: false, message: "This unit is already billed or paid, so it wasn't voided.", fullyVoided: false };
    await prisma.turnoverRequest.update({ where: { id: project.turnoverRequestId }, data: { billingStatus: "VOIDED", voidReason } });
    await syncProjectBillingFromRequest(project.turnoverRequestId, "VOIDED", null, voidReason);
    return { ok: true, message: "Job voided", fullyVoided: true };
  }

  const lines = project.sov?.items ?? [];
  if (lines.length > 0) {
    const open = lines.filter((l) => normalizeBillingStatus(l.billingStatus) === "NOT_BILLED");
    if (open.length === 0) return { ok: false, message: "Every SOV line is already billed, paid or voided, so nothing was voided.", fullyVoided: false };
    await prisma.projectSOVItem.updateMany({ where: { id: { in: open.map((l) => l.id) } }, data: { billingStatus: "VOIDED", voidReason } });
    await syncSovPercentDone(projectId);
    await syncProjectBillingFromSOV(projectId);
    const kept = lines.filter((l) => {
      const s = normalizeBillingStatus(l.billingStatus);
      return s === "BILLED" || s === "PAID";
    }).length;
    return {
      ok: true,
      message: kept
        ? `Voided ${open.length} SOV line${open.length === 1 ? "" : "s"}. ${kept} billed or paid line${kept === 1 ? "" : "s"} stayed as they were, so the job isn't fully voided.`
        : "Job voided",
      fullyVoided: kept === 0,
    };
  }

  if (normalizeBillingStatus(project.billingStatus) !== "NOT_BILLED") {
    return { ok: false, message: "This job is already billed or paid, so it wasn't voided.", fullyVoided: false };
  }
  await prisma.project.update({ where: { id: projectId }, data: { billingStatus: "VOIDED", voidReason } });
  return { ok: true, message: "Job voided", fullyVoided: true };
}

/**
 * Undoes voidJob: the job goes back to Not billed wherever its billing lives
 * (the unit, its voided SOV lines, or the project) and the void reason is
 * cleared. Calendar days are left alone, so days cancelled by the void stay
 * gray with their notes (restore one from the calendar if it's needed).
 */
export async function unvoidJob(projectId: string): Promise<{ ok: boolean; message: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      billingStatus: true,
      turnoverRequestId: true,
      sov: { select: { items: { select: { id: true, billingStatus: true } } } },
    },
  });
  if (!project) return { ok: false, message: "Job not found" };
  if (normalizeBillingStatus(project.billingStatus) !== "VOIDED") return { ok: false, message: "This job isn't voided" };

  if (project.turnoverRequestId) {
    await prisma.turnoverRequest.update({ where: { id: project.turnoverRequestId }, data: { billingStatus: "NOT_BILLED", voidReason: null } });
    await syncProjectBillingFromRequest(project.turnoverRequestId, "NOT_BILLED");
    return { ok: true, message: "Void undone, the job is Not billed again" };
  }

  const voidedLines = (project.sov?.items ?? []).filter((l) => normalizeBillingStatus(l.billingStatus) === "VOIDED");
  if (voidedLines.length > 0) {
    await prisma.projectSOVItem.updateMany({ where: { id: { in: voidedLines.map((l) => l.id) } }, data: { billingStatus: "NOT_BILLED", voidReason: null } });
    await prisma.project.update({ where: { id: projectId }, data: { voidReason: null } });
    await syncSovPercentDone(projectId);
    await syncProjectBillingFromSOV(projectId);
    return { ok: true, message: "Void undone, the job is Not billed again" };
  }

  await prisma.project.update({ where: { id: projectId }, data: { billingStatus: "NOT_BILLED", voidReason: null } });
  return { ok: true, message: "Void undone, the job is Not billed again" };
}
