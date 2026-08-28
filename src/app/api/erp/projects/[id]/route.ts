import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";
import { PROJECT_SEGMENTS, normalizeProjectSegment } from "@/lib/erp/projectSegments";
import { getErpAuth, canOverrideQualityChecklist, canEditPricing } from "@/lib/erpAuth";
import { ALL_CHECKLIST_ITEM_IDS } from "@/lib/erp/unitTurnoverChecklistTemplate";
import { notifyProjectRescheduled } from "@/lib/erp/notifyReschedule";
import { contractedTurnoverScope } from "@/lib/erp/turnoverScope";
import { sanitizeChangeOrderLaborRateCard } from "@/lib/changeOrderLaborRates";
import type { ErpRole } from "@/lib/erpSession";

const STATUSES = ["ACTIVE", "UPCOMING", "ON_HOLD", "COMPLETE", "ARCHIVED"] as const;
const BILLING_STATUSES = ["BILLING", "INACTIVE", "INVOICE_PAID", "NOT_BILLED", "BILLED", "PAID"] as const;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      laborEntries: { orderBy: { workDate: "desc" } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pct = (v: unknown) => {
    if (v === undefined) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(100, Math.max(0, n));
  };

  const cents = (v: unknown) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return inputToCents(v);
  };

  const data: Record<string, unknown> = {};

  if (body.jobTitle !== undefined) data.jobTitle = String(body.jobTitle || "").trim() || existing.jobTitle;
  if (body.supervisor !== undefined) {
    const supervisor = String(body.supervisor || "").trim();
    if (!supervisor) return NextResponse.json({ error: "supervisor (PM) is required" }, { status: 400 });
    data.supervisor = supervisor;
  }
  if (body.supervisorUserId !== undefined) {
    data.supervisorUserId = body.supervisorUserId ? String(body.supervisorUserId).trim() : null;
  }
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
  if (body.projectDate !== undefined) {
    data.projectDate =
      body.projectDate === null || body.projectDate === ""
        ? null
        : new Date(String(body.projectDate));
  }
  if (body.projectEndDate !== undefined) {
    data.projectEndDate =
      body.projectEndDate === null || body.projectEndDate === ""
        ? null
        : new Date(String(body.projectEndDate));
  }
  if (body.percentDone !== undefined) data.percentDone = pct(body.percentDone) ?? 0;
  if (body.percentInvoiced !== undefined) data.percentInvoiced = pct(body.percentInvoiced) ?? 0;
  if (body.segment !== undefined) {
    const normalized = normalizeProjectSegment(String(body.segment));
    if (PROJECT_SEGMENTS.includes(normalized)) data.segment = normalized;
  }
  // Closes a gap where a project completed via the HubSpot sync path (which
  // writes status directly and never stamps turnoverCompletedAt — see
  // syncDealsToProjects.ts) gets recategorized into
  // JANITORIAL_TURNOVER_REQUESTS after the fact. becomingComplete below
  // won't fire for it since existing.status is already COMPLETE, so
  // without this it would stay permanently invisible to the completion
  // digest. Best-effort backfill, not a fresh completion — no end date to
  // require here, same fallback as the one-time historical backfill.
  if (
    data.segment === "JANITORIAL_TURNOVER_REQUESTS" &&
    existing.segment !== "JANITORIAL_TURNOVER_REQUESTS" &&
    existing.status === "COMPLETE" &&
    existing.turnoverCompletedAt == null
  ) {
    data.turnoverCompletedAt = existing.projectEndDate ?? existing.updatedAt;
  }
  if (body.hubspotPipelineId !== undefined) {
    data.hubspotPipelineId = body.hubspotPipelineId ? String(body.hubspotPipelineId).trim() : null;
  }
  if (body.turnoverRequestId !== undefined) {
    data.turnoverRequestId = body.turnoverRequestId ? String(body.turnoverRequestId).trim() : null;
  }
  if (body.status !== undefined) {
    const s = String(body.status).toUpperCase();
    if (STATUSES.includes(s as (typeof STATUSES)[number])) data.status = s;
  }
  if (body.billingStatus !== undefined) {
    if (body.billingStatus === null || body.billingStatus === "") {
      data.billingStatus = null;
    } else {
      const b = String(body.billingStatus).toUpperCase();
      if (BILLING_STATUSES.includes(b as (typeof BILLING_STATUSES)[number])) data.billingStatus = b;
    }
  }
  if (body.percentInvoiced !== undefined) data.percentInvoiced = pct(body.percentInvoiced) ?? 0;

  if (body.pricingPackage !== undefined) data.pricingPackage = body.pricingPackage ?? null;

  if (body.laborRateCard !== undefined) {
    const role = (req.headers.get("x-erp-role") as ErpRole) ?? "EMPLOYEE";
    if (!canEditPricing(role)) {
      return NextResponse.json(
        { error: "Only Admin, Project Manager, Sales, or Estimation roles can edit labor rates" },
        { status: 403 },
      );
    }
    data.laborRateCard = body.laborRateCard == null ? null : sanitizeChangeOrderLaborRateCard(body.laborRateCard);
  }
  if (body.contractValue !== undefined) {
    data.contractValueCents = cents(body.contractValue);

    // For a turnover unit, billing prefers TurnoverRequest.approvedPriceCents over
    // Project.contractValueCents (see billing/janitorial/route.ts), so a manual edit
    // here has to flow into that override to actually change what gets billed,
    // otherwise it only ever changes what shows on dashboards/reports.
    if (existing.turnoverRequestId) {
      if (data.contractValueCents === null) {
        // Clearing the override reverts billing to the pricing-package's computed
        // price, so mirror that same value back here instead of leaving this blank.
        const tr = await prisma.turnoverRequest.update({
          where: { id: existing.turnoverRequestId },
          data: { approvedPriceCents: null },
          select: { priceCents: true },
        });
        data.contractValueCents = tr.priceCents ?? null;
      } else {
        await prisma.turnoverRequest.update({
          where: { id: existing.turnoverRequestId },
          data: { approvedPriceCents: data.contractValueCents as number },
        });
      }
    }
  }
  if (body.estMaterial !== undefined) data.estMaterialCents = cents(body.estMaterial);
  if (body.estTravel !== undefined) data.estTravelCents = cents(body.estTravel);
  if (body.estLabor !== undefined) data.estLaborCents = cents(body.estLabor);
  if (body.actualLabor !== undefined) data.actualLaborCents = cents(body.actualLabor);
  if (body.actualMaterial !== undefined) data.actualMaterialCents = cents(body.actualMaterial);
  if (body.actualTravel !== undefined) data.actualTravelCents = cents(body.actualTravel);
  if (body.estHours !== undefined) {
    data.estHours =
      body.estHours === null || body.estHours === "" ? null : Number(body.estHours);
  }
  if (body.actualHours !== undefined) {
    data.actualHours =
      body.actualHours === null || body.actualHours === "" ? null : Number(body.actualHours);
  }
  if (body.estimatedDays !== undefined) {
    data.estimatedDays =
      body.estimatedDays === null || body.estimatedDays === "" ? null : Math.round(Number(body.estimatedDays));
  }
  if (body.commissionPaid !== undefined) {
    data.commissionPaidAt = body.commissionPaid ? new Date() : null;
  }
  if (body.commissionEmployeeId !== undefined) {
    data.commissionEmployeeId = body.commissionEmployeeId ? String(body.commissionEmployeeId).trim() : null;
  }

  // Fully invoiced isn't the same as paid — a project can sit at 100%
  // invoiced while still awaiting payment, so percentInvoiced reaching 100
  // must NOT auto-mark it paid. billingStatus has to be set explicitly.
  //
  // The inverse does hold, though: billingStatus values that unambiguously
  // mean "fully invoiced" (PAID/BILLED/INVOICE_PAID) should default
  // percentInvoiced to 100 when this request doesn't already specify it —
  // this is what keeps the Janitorial/Recurring billing tabs' direct-PATCH
  // fallback (no turnoverRequestId to sync through) from leaving
  // percentInvoiced stale at 0 once something is marked paid.
  if (
    body.percentInvoiced === undefined &&
    typeof data.billingStatus === "string" &&
    ["PAID", "BILLED", "INVOICE_PAID"].includes(data.billingStatus)
  ) {
    data.percentInvoiced = 100;
  }

  // Stamp billingCompletedAt the first time billingStatus becomes paid via a
  // manual edit — same rule the SOV/turnover-request sync paths follow, so
  // commission gating/year-bucketing has a signal regardless of which path
  // marked it paid. Fully billed isn't enough. Accepts "PAID" alongside the
  // canonical "INVOICE_PAID" — see BILLING_STATUSES above.
  const nextBillingStatus = data.billingStatus !== undefined ? (data.billingStatus as string | null) : existing.billingStatus;
  if ((nextBillingStatus === "INVOICE_PAID" || nextBillingStatus === "PAID") && !existing.billingCompletedAt) {
    data.billingCompletedAt = new Date();
  }

  // Computed once and reused below for both the quality-checklist gate and
  // the turnoverCompletedAt/scope-stamping logic — previously recomputed
  // independently in both places, which risked the two drifting apart.
  const becomingComplete =
    data.status === "COMPLETE" && existing.status !== "COMPLETE" && existing.segment === "JANITORIAL_TURNOVER_REQUESTS";

  // A turnover unit can't be marked complete with an unfinished quality
  // checklist unless the acting user is a PM/ADMIN — SUPERVISOR must finish it.
  if (becomingComplete) {
    const auth = await getErpAuth();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canOverrideQualityChecklist(auth.role)) {
      const checklist = await prisma.unitTurnoverChecklist.findUnique({ where: { projectId: id }, select: { completedItems: true } });
      const completed = (checklist?.completedItems ?? {}) as Record<string, boolean>;
      const allDone = ALL_CHECKLIST_ITEM_IDS.every((itemId) => completed[itemId]);
      if (!allDone) {
        return NextResponse.json(
          { error: "Finish the quality checklist before marking this unit complete. A PM can override if needed." },
          { status: 400 },
        );
      }
    }
  }

  // A real projectDate change (not just touching other fields, and not
  // clearing it to null) is a reschedule — covers every path that lands
  // here: drag-and-drop on the calendar, the event card's "Save dates", and
  // the project Setup tab, all of which PATCH this same route.
  const newProjectDate = data.projectDate as Date | null | undefined;
  const projectDateChanged =
    newProjectDate !== undefined && (newProjectDate?.getTime() ?? null) !== (existing.projectDate?.getTime() ?? null);
  const shouldNotifyReschedule = projectDateChanged && newProjectDate != null;

  // Marking a turnover unit complete means every part of its contracted
  // scope is done, whether or not each item was individually checked off
  // along the way (see UnitScopeChecklist/ProjectLaborSection). Persisting
  // this (rather than just assuming it at display time) keeps every reader
  // in sync, including the schedule's day-assignment scope picker, which
  // reads TurnoverRequest.completedScopeItems directly.

  // An end date is required to mark a turnover unit complete — not "now",
  // since the day someone gets around to checking the box (or backdating a
  // labor log) isn't necessarily the day the unit actually finished, and
  // the completion-digest email groups by day. turnoverCompletedAt mirrors
  // whatever end date was supplied here rather than the server clock, and
  // — unlike projectEndDate — never gets touched again after this, so it
  // stays a stable record of what day this was marked complete as, even if
  // projectEndDate is later edited for unrelated scheduling reasons.
  if (becomingComplete) {
    if (!data.projectEndDate) {
      return NextResponse.json(
        { error: "An end date is required to mark this unit complete." },
        { status: 400 },
      );
    }
    data.turnoverCompletedAt = data.projectEndDate;
  }

  try {
    const project = await prisma.project.update({ where: { id }, data: data as object });

    if (becomingComplete && existing.turnoverRequestId) {
      const tr = await prisma.turnoverRequest.findUnique({
        where: { id: existing.turnoverRequestId },
        select: {
          fullClean: true,
          fullPaint: true,
          touchUpPaint: true,
          carpetCleaning: true,
          ceilingPaint: true,
          materialsAdditional: true,
          compounding: true,
          otherWork: true,
        },
      });
      if (tr) {
        await prisma.turnoverRequest.update({
          where: { id: existing.turnoverRequestId },
          data: { completedScopeItems: contractedTurnoverScope(tr) },
        });
      }
    }

    if (shouldNotifyReschedule) {
      // Once a day is actually assigned (supervisor scheduled via the
      // calendar), the calendar reads that ProjectDayAssignment's own date,
      // not Project.projectDate — so without this, editing "Start date"
      // here silently stops moving the chip. Only handled for the common
      // single-day case (no seriesId); a multi-day/repeat series has no one
      // unambiguous day to move, so those are left alone and should be
      // rescheduled from the Schedule page instead.
      // Also drives whether the reschedule email below fires: with 2+ day
      // assignments (or a fetch failure), which one "moved" is ambiguous
      // and the calendar wasn't touched here — emailing "moved to X" in
      // that case would say something the calendar doesn't show.
      let dayAssignmentCount = 0;
      try {
        const dayAssignments = await prisma.projectDayAssignment.findMany({ where: { projectId: id } });
        dayAssignmentCount = dayAssignments.length;
        const soleAssignment =
          dayAssignments.length === 1 && dayAssignments[0]!.seriesId == null ? dayAssignments[0]! : null;
        if (soleAssignment && soleAssignment.date.getTime() !== newProjectDate!.getTime()) {
          await prisma.$transaction([
            prisma.projectDayAssignment.update({ where: { id: soleAssignment.id }, data: { date: newProjectDate! } }),
            prisma.projectWorkerDayAssignment.updateMany({
              where: { projectId: id, date: soleAssignment.date },
              data: { date: newProjectDate! },
            }),
          ]);
        }
      } catch (e) {
        console.error("Failed to move day assignment alongside projectDate", e);
      }

      if (dayAssignmentCount <= 1) {
        const finalSupervisorUserId =
          data.supervisorUserId !== undefined ? (data.supervisorUserId as string | null) : existing.supervisorUserId;
        const finalSupervisorName = data.supervisor !== undefined ? (data.supervisor as string) : existing.supervisor;
        try {
          await notifyProjectRescheduled({
            projectId: id,
            jobTitle: project.jobTitle,
            oldDateKey: existing.projectDate ? existing.projectDate.toISOString().slice(0, 10) : null,
            newDateKey: newProjectDate!.toISOString().slice(0, 10),
            supervisorUserId: finalSupervisorUserId,
            projectManagerName: finalSupervisorName,
            projectDescription: project.description,
          });
        } catch (e) {
          console.error("Failed to notify project reschedule", e);
        }
      } else {
        console.log(`Skipped reschedule notification for project ${id}: ${dayAssignmentCount} day assignments, ambiguous which moved`);
      }
    }

    return NextResponse.json(project);
  } catch (e) {
    console.error("PATCH /api/erp/projects/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}