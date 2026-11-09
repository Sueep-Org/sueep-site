/**
 * A sub's jobs for their portal (/sub/[token]): every day they're on the
 * schedule, from the same four places their invites come from.
 *
 * - Running a project day (ProjectDayAssignment.supervisorContractorId), most subs
 * - Running a change order day (ChangeOrderDayAssignment.supervisorContractorId)
 * - On a project day's crew (ProjectWorkerDayAssignment.contractorId)
 * - On a change order day's crew (ChangeOrderWorkerDayAssignment.contractorId)
 *
 * Days in a row on the same job are one visit, shown as one card with the
 * pay once, the same way the invite email lists them. Only the sub's own
 * pay ever leaves this file: never our price, margin or other people.
 */
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/erp/schedule";
import { todayEasternKey } from "@/lib/erp/dates";
import { hasCalendarSubPay } from "@/lib/erp/projectSegments";
import { turnoverScopeDisplayLabel } from "@/lib/erp/turnoverScope";
import { scopeText } from "@/lib/erp/scheduleInvites";
import { coRequestOpenFor, coRequestPath } from "@/lib/erp/subCoRequests";
import type { ConfirmationStatus } from "@/lib/erp/scheduleConfirmations";
import { tr, type Lang } from "@/lib/erp/language";
import { crewOf, type CrewDayRef } from "@/lib/erp/subCrew";

/** How far back the Past tab goes */
const PAST_DAYS = 180;

/** Turnover units, where leads can request change orders (same check as isTurnoverProject) */
const TURNOVER_SEGMENT = "JANITORIAL_TURNOVER_REQUESTS";

export type SubJobDay = {
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  /** Their answer to this day's invite. Null when no invite went out. */
  status: ConfirmationStatus | null;
  /** The Confirm / Can't make it page for this day, while it's upcoming */
  respondPath: string | null;
};

export type SubJob = {
  key: string;
  /** "p:<projectId>" or "co:<changeOrderId>", what check-ins are saved against */
  jobKey: string;
  title: string;
  /** "Running the job" (in charge that day) or "Crew" */
  role: "lead" | "crew";
  address: string | null;
  scope: string | null;
  notes: string | null;
  /** Their pay for this visit, null when none is set */
  payCents: number | null;
  days: SubJobDay[];
  /** Turnover leads: their change order request page while it takes requests */
  coRequestPath: string | null;
  /** Leads: how many people they said they're bringing */
  crew: { count: number; names: string[] } | null;
  /** Leads: the days whose crew they can still change (from tomorrow on) */
  crewDays: CrewDayRef[];
};

export type SubJobs = { upcoming: SubJob[]; past: SubJob[]; today: string };

type ProjectInfo = {
  jobTitle: string;
  segment: string;
  building: { address: string } | null;
  workOrderRecord: { siteAddress: string | null } | null;
  turnoverRequest: { otherDescription: string | null } | null;
};

const PROJECT_SELECT = {
  jobTitle: true,
  segment: true,
  building: { select: { address: true } },
  workOrderRecord: { select: { siteAddress: true } },
  turnoverRequest: { select: { otherDescription: true } },
} as const;

const CREW_SELECT = { supervisorContractorId: true, subCrewContractorId: true, subCrewCount: true, subCrewNames: true } as const;

function addressOf(p: ProjectInfo): string | null {
  return p.building?.address || p.workOrderRecord?.siteAddress || null;
}

/** One scheduled day before grouping into visits */
type Row = {
  group: string;
  title: string;
  role: "lead" | "crew";
  address: string | null;
  scope: string | null;
  notes: string | null;
  /** Lead days: the visit's pay line, so days with different pay aren't merged */
  payLineId: string | null;
  payCents: number | null;
  uid: string;
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  turnover: boolean;
  /** Lead days: the day row, for setting the crew */
  ref: CrewDayRef | null;
  crew: { count: number; names: string[] } | null;
};

function joinNotes(dayNote: string | null | undefined, pmNote: string | null | undefined, lang: Lang): string | null {
  const parts = [
    dayNote?.trim(),
    pmNote?.trim() ? `${tr(lang, { en: "From the property manager", es: "Del administrador de la propiedad" })}: ${pmNote.trim()}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

type TabLine = { id: string; costCents: number | null; startDate: Date | null; endDate: Date | null; assignedDate: Date | null; createdAt: Date };

/** Same rule as subPay.ts coversAnyDay: does a Contractors tab line cover this day? */
function covers(l: TabLine, day: Date): boolean {
  const t = day.getTime();
  if (l.startDate && l.endDate) return l.startDate.getTime() <= t && t <= l.endDate.getTime();
  if (l.startDate) return l.startDate.getTime() === t;
  if (l.endDate) return l.endDate.getTime() === t;
  return l.assignedDate?.getTime() === t;
}

/** The newest tab line covering the day, like tabLineCovering. Lines come sorted newest first. */
function tabLineFor(lines: TabLine[] | undefined, day: Date): TabLine | null {
  return lines?.find((l) => covers(l, day)) ?? null;
}

function byJob<T extends { createdAt: Date }>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return out;
}

async function propertyManagerNotes(projectIds: string[]): Promise<Map<string, string>> {
  if (projectIds.length === 0) return new Map();
  const rows = await prisma.propertyManagerRequest.findMany({
    where: { projectId: { in: projectIds }, notes: { not: null } },
    select: { projectId: true, notes: true },
  });
  const out = new Map<string, string>();
  for (const r of rows) if (r.projectId && r.notes && !out.has(r.projectId)) out.set(r.projectId, r.notes);
  return out;
}

export async function loadSubJobs(contractorId: string, lang: Lang): Promise<SubJobs> {
  const today = todayEasternKey();
  const from = new Date(`${today}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - PAST_DAYS);
  const since = { gte: from };

  const [leadDays, coLeadDays, crewDays, coCrewDays] = await Promise.all([
    prisma.projectDayAssignment.findMany({
      where: { supervisorContractorId: contractorId, date: since },
      select: {
        id: true,
        projectId: true,
        date: true,
        startTime: true,
        endTime: true,
        comment: true,
        scopeItems: true,
        sovItems: { select: { description: true } },
        subPayAssignment: { select: { id: true, contractorId: true, costCents: true } },
        project: { select: PROJECT_SELECT },
        ...CREW_SELECT,
      },
    }),
    prisma.changeOrderDayAssignment.findMany({
      where: { supervisorContractorId: contractorId, date: since },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        comment: true,
        subPayAssignment: { select: { id: true, contractorId: true, costCents: true } },
        changeOrder: { select: { id: true, title: true, project: { select: PROJECT_SELECT } } },
        ...CREW_SELECT,
      },
    }),
    prisma.projectWorkerDayAssignment.findMany({
      where: { contractorId, date: since },
      select: {
        id: true,
        projectId: true,
        date: true,
        assignedScopeItem: true,
        assignedSovItem: { select: { description: true } },
        project: { select: PROJECT_SELECT },
      },
    }),
    prisma.changeOrderWorkerDayAssignment.findMany({
      where: { contractorId, date: since },
      select: { id: true, changeOrderId: true, date: true, changeOrder: { select: { title: true, project: { select: PROJECT_SELECT } } } },
    }),
  ]);

  // The project or CO day each crew row sits on, for its times, scope and note
  const crewDayRows = crewDays.length
    ? await prisma.projectDayAssignment.findMany({
        where: { OR: crewDays.map((w) => ({ projectId: w.projectId, date: w.date })) },
        select: { projectId: true, date: true, startTime: true, endTime: true, comment: true, scopeItems: true, sovItems: { select: { description: true } } },
      })
    : [];
  const crewDayOf = new Map(crewDayRows.map((d) => [`${d.projectId}|${dayKey(d.date)}`, d]));
  const coCrewDayRows = coCrewDays.length
    ? await prisma.changeOrderDayAssignment.findMany({
        where: { OR: coCrewDays.map((w) => ({ changeOrderId: w.changeOrderId, date: w.date })) },
        select: { changeOrderId: true, date: true, startTime: true, endTime: true, comment: true },
      })
    : [];
  const coCrewDayOf = new Map(coCrewDayRows.map((d) => [`${d.changeOrderId}|${dayKey(d.date)}`, d]));

  // Pay typed in a Contractors tab instead of the day card, one query each
  const tabSelect = { id: true, costCents: true, startDate: true, endDate: true, assignedDate: true, createdAt: true } as const;
  const [tabLines, coTabLines] = await Promise.all([
    leadDays.length
      ? prisma.contractorAssignment.findMany({
          where: { contractorId, setOnSchedule: false, costCents: { not: null }, projectId: { in: [...new Set(leadDays.map((d) => d.projectId))] } },
          select: { ...tabSelect, projectId: true },
        })
      : [],
    coLeadDays.length
      ? prisma.changeOrderContractorAssignment.findMany({
          where: { contractorId, setOnSchedule: false, costCents: { not: null }, changeOrderId: { in: [...new Set(coLeadDays.map((d) => d.changeOrder.id))] } },
          select: { ...tabSelect, changeOrderId: true },
        })
      : [],
  ]);
  const tabLinesOf = byJob(tabLines, (l) => l.projectId ?? "");
  const coTabLinesOf = byJob(coTabLines, (l) => l.changeOrderId);

  const pmNotes = await propertyManagerNotes([...new Set([...leadDays.map((d) => d.projectId), ...crewDays.map((w) => w.projectId)])]);

  const rows: Row[] = [];

  for (const d of leadDays) {
    const p = d.project;
    const label = (v: string) => turnoverScopeDisplayLabel(v, p.turnoverRequest?.otherDescription);
    const line = d.subPayAssignment && d.subPayAssignment.contractorId === contractorId ? d.subPayAssignment : null;
    let payCents: number | null = null;
    let payLineId: string | null = null;
    if (hasCalendarSubPay(p.segment)) {
      if (line?.costCents != null) {
        payCents = line.costCents;
        payLineId = line.id;
      } else {
        const tab = tabLineFor(tabLinesOf.get(d.projectId), d.date);
        payCents = tab?.costCents ?? null;
        payLineId = tab?.id ?? null;
      }
    }
    rows.push({
      group: `p:${d.projectId}`,
      title: p.jobTitle,
      role: "lead",
      address: addressOf(p),
      scope: scopeText(d.sovItems.map((s) => s.description), d.scopeItems.map(label)),
      notes: joinNotes(d.comment, pmNotes.get(d.projectId), lang),
      payLineId,
      payCents,
      uid: `day-assignment-${d.id}-sub-${contractorId}@sueep.com`,
      dateKey: dayKey(d.date),
      startTime: d.startTime,
      endTime: d.endTime,
      turnover: p.segment === TURNOVER_SEGMENT,
      ref: { kind: "day", dayId: d.id },
      crew: crewOf(d),
    });
  }

  for (const d of coLeadDays) {
    const co = d.changeOrder;
    const linked = d.subPayAssignment && d.subPayAssignment.contractorId === contractorId && d.subPayAssignment.costCents != null ? d.subPayAssignment : null;
    const line = linked ?? tabLineFor(coTabLinesOf.get(co.id), d.date);
    rows.push({
      group: `co:${co.id}`,
      title: `${co.title} (${co.project.jobTitle})`,
      role: "lead",
      address: addressOf(co.project),
      scope: null,
      notes: joinNotes(d.comment, null, lang),
      payLineId: line?.id ?? null,
      payCents: line?.costCents ?? null,
      uid: `co-day-assignment-${d.id}-sub-${contractorId}@sueep.com`,
      dateKey: dayKey(d.date),
      startTime: d.startTime,
      endTime: d.endTime,
      turnover: false,
      ref: { kind: "co-day", dayId: d.id },
      crew: crewOf(d),
    });
  }

  for (const w of crewDays) {
    const p = w.project;
    const key = dayKey(w.date);
    const day = crewDayOf.get(`${w.projectId}|${key}`);
    const label = (v: string) => turnoverScopeDisplayLabel(v, p.turnoverRequest?.otherDescription);
    const own = w.assignedSovItem?.description ?? (w.assignedScopeItem ? label(w.assignedScopeItem) : null);
    rows.push({
      group: `p:${w.projectId}`,
      title: p.jobTitle,
      role: "crew",
      address: addressOf(p),
      scope: own ?? (day ? scopeText(day.sovItems.map((s) => s.description), day.scopeItems.map(label)) : null),
      notes: joinNotes(day?.comment, pmNotes.get(w.projectId), lang),
      payLineId: null,
      payCents: null,
      uid: `worker-assignment-${w.id}@sueep.com`,
      dateKey: key,
      startTime: day?.startTime ?? null,
      endTime: day?.endTime ?? null,
      turnover: false,
      ref: null,
      crew: null,
    });
  }

  for (const w of coCrewDays) {
    const key = dayKey(w.date);
    const day = coCrewDayOf.get(`${w.changeOrderId}|${key}`);
    rows.push({
      group: `co:${w.changeOrderId}`,
      title: `${w.changeOrder.title} (${w.changeOrder.project.jobTitle})`,
      role: "crew",
      address: addressOf(w.changeOrder.project),
      scope: null,
      notes: joinNotes(day?.comment, null, lang),
      payLineId: null,
      payCents: null,
      uid: `co-worker-assignment-${w.id}@sueep.com`,
      dateKey: key,
      startTime: day?.startTime ?? null,
      endTime: day?.endTime ?? null,
      turnover: false,
      ref: null,
      crew: null,
    });
  }

  const confirmations = rows.length
    ? await prisma.scheduleConfirmation.findMany({ where: { uid: { in: rows.map((r) => r.uid) } }, select: { uid: true, token: true, status: true } })
    : [];
  const confirmationOf = new Map(confirmations.map((c) => [c.uid, c]));

  // One visit = the days sharing a pay line (paid once, even with a gap
  // between them), else days in a row on the same job and role
  rows.sort((a, b) => a.group.localeCompare(b.group) || a.role.localeCompare(b.role) || a.dateKey.localeCompare(b.dateKey));
  const visits: { rows: Row[] }[] = [];
  const visitOfLine = new Map<string, { rows: Row[] }>();
  for (const r of rows) {
    if (r.payLineId) {
      const v = visitOfLine.get(r.payLineId);
      if (v) v.rows.push(r);
      else {
        const nv = { rows: [r] };
        visitOfLine.set(r.payLineId, nv);
        visits.push(nv);
      }
      continue;
    }
    const prev = visits[visits.length - 1];
    const last = prev?.rows.at(-1);
    const sameVisit =
      last &&
      !last.payLineId &&
      last.group === r.group &&
      last.role === r.role &&
      (new Date(`${r.dateKey}T00:00:00Z`).getTime() - new Date(`${last.dateKey}T00:00:00Z`).getTime()) / 864e5 <= 1;
    if (sameVisit) prev!.rows.push(r);
    else visits.push({ rows: [r] });
  }

  const jobs = await Promise.all(
    visits.map(async ({ rows: vr }): Promise<SubJob> => {
      const first = vr[0]!;
      const lastKey = vr[vr.length - 1]!.dateKey;
      const days = vr.map((r): SubJobDay => {
        const c = confirmationOf.get(r.uid);
        const open = !!c && r.dateKey >= today && c.status !== "CANCELLED";
        return {
          dateKey: r.dateKey,
          startTime: r.startTime,
          endTime: r.endTime,
          status: (c?.status as ConfirmationStatus | undefined) ?? null,
          respondPath: open ? `/schedule-response/${c!.token}` : null,
        };
      });
      // The CO request page works per invite; the visit's first open one is enough
      let coPath: string | null = null;
      if (first.turnover && lastKey >= today) {
        for (const r of vr) {
          const c = confirmationOf.get(r.uid);
          if (c && (await coRequestOpenFor(c.token))) {
            coPath = coRequestPath(c.token);
            break;
          }
        }
      }
      return {
        key: `${first.group}|${first.role}|${first.dateKey}`,
        jobKey: first.group,
        title: first.title,
        role: first.role,
        address: first.address,
        scope: vr.every((r) => r.scope === first.scope) ? first.scope : [...new Set(vr.map((r) => r.scope).filter(Boolean))].join("; ") || null,
        notes: [...new Set(vr.map((r) => r.notes).filter(Boolean))].join("\n") || null,
        // A visit's pay is one amount, not per day (see subPay.ts)
        payCents: vr.find((r) => r.payCents != null)?.payCents ?? null,
        days,
        coRequestPath: coPath,
        // The next day's crew is what's coming; fall back to any day's
        crew: (vr.find((r) => r.dateKey >= today && r.crew) ?? vr.find((r) => r.crew))?.crew ?? null,
        crewDays: vr.flatMap((r) => (r.ref && r.dateKey > today ? [r.ref] : [])),
      };
    })
  );

  const lastDay = (j: SubJob) => j.days[j.days.length - 1]!.dateKey;
  return {
    today,
    upcoming: jobs.filter((j) => lastDay(j) >= today).sort((a, b) => a.days[0]!.dateKey.localeCompare(b.days[0]!.dateKey)),
    past: jobs.filter((j) => lastDay(j) < today).sort((a, b) => lastDay(b).localeCompare(lastDay(a))),
  };
}
