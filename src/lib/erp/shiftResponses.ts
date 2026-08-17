import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "@/lib/erp/dates";
import { dayKey } from "@/lib/erp/schedule";

/** Shared "accept/decline a scheduled shift" logic — used by both the
 * public no-login token page (src/app/shift-response/[token]) and the
 * ERP-authenticated supervisor route
 * (src/app/api/erp/schedule/day-assignments/[id]/respond), so the actual
 * status-transition rules live in exactly one place regardless of which
 * channel someone responds through. */

// Re-exported so every existing `from "@/lib/erp/shiftResponses"` import
// keeps working — see shiftResponseFlag.ts for why the constant itself
// lives in its own dependency-free file.
export { SHIFT_RESPONSE_ENABLED } from "./shiftResponseFlag";

export const SHIFT_RESPONSE_STATUSES = ["PENDING", "ACCEPTED", "DECLINED"] as const;
export type ShiftResponseStatus = (typeof SHIFT_RESPONSE_STATUSES)[number];

/** "day" = the supervisor/PM's own ProjectDayAssignment row. "worker" = one
 * crew member's ProjectWorkerDayAssignment row. Each kind's responseToken is
 * unique within its own table, not globally, so a token lookup has to try
 * both — see resolveShiftResponseByToken. */
export type ShiftResponseKind = "day" | "worker";

export type ResolvedShiftResponse = {
  kind: ShiftResponseKind;
  id: string;
  projectId: string;
  jobTitle: string;
  dateKey: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  role: "Supervising" | "Working";
  status: ShiftResponseStatus;
  /** The shift's date is before today (Eastern) — the public page shows a
   * read-only "already happened" state, and recordShiftResponse hard-blocks
   * writing a response for one of these regardless of channel. */
  isPast: boolean;
};

export class ShiftAlreadyPassedError extends Error {
  constructor() {
    super("This shift has already happened.");
    this.name = "ShiftAlreadyPassedError";
  }
}

function isPastDateKey(dk: string, now: Date = new Date()): boolean {
  return dk < todayEasternKey(now);
}

async function projectDisplayInfo(projectId: string): Promise<{ jobTitle: string; location: string | null } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { jobTitle: true, building: { select: { address: true } }, workOrderRecord: { select: { siteAddress: true } } },
  });
  if (!project) return null;
  return { jobTitle: project.jobTitle, location: project.building?.address || project.workOrderRecord?.siteAddress || null };
}

async function toResolvedDay(row: {
  id: string;
  projectId: string;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  responseStatus: string;
}): Promise<ResolvedShiftResponse | null> {
  const info = await projectDisplayInfo(row.projectId);
  if (!info) return null;
  const dk = dayKey(row.date);
  return {
    kind: "day",
    id: row.id,
    projectId: row.projectId,
    jobTitle: info.jobTitle,
    dateKey: dk,
    startTime: row.startTime,
    endTime: row.endTime,
    location: info.location,
    role: "Supervising",
    status: row.responseStatus as ShiftResponseStatus,
    isPast: isPastDateKey(dk),
  };
}

async function toResolvedWorker(row: {
  id: string;
  projectId: string;
  date: Date;
  responseStatus: string;
}): Promise<ResolvedShiftResponse | null> {
  const info = await projectDisplayInfo(row.projectId);
  if (!info) return null;
  // A crew member's own start/end time isn't stored on their row — it's the
  // day's overall time, same source the invite email itself reads from
  // (see notifyProjectCrew) — so pull it from the day assignment if one
  // exists, matching what was actually emailed.
  const dayAssignment = await prisma.projectDayAssignment.findUnique({
    where: { projectId_date: { projectId: row.projectId, date: row.date } },
    select: { startTime: true, endTime: true },
  });
  const dk = dayKey(row.date);
  return {
    kind: "worker",
    id: row.id,
    projectId: row.projectId,
    jobTitle: info.jobTitle,
    dateKey: dk,
    startTime: dayAssignment?.startTime ?? null,
    endTime: dayAssignment?.endTime ?? null,
    location: info.location,
    role: "Working",
    status: row.responseStatus as ShiftResponseStatus,
    isPast: isPastDateKey(dk),
  };
}

/** Looks up a shift by its response token, trying ProjectDayAssignment first
 * then ProjectWorkerDayAssignment — each table's token is its own @unique
 * column, so there's no cross-table collision risk in practice (UUIDs), but
 * the lookup itself has to check both since nothing in the token string
 * says which table it belongs to. */
export async function resolveShiftResponseByToken(token: string): Promise<ResolvedShiftResponse | null> {
  const day = await prisma.projectDayAssignment.findUnique({ where: { responseToken: token } });
  if (day) return toResolvedDay(day);
  const worker = await prisma.projectWorkerDayAssignment.findUnique({ where: { responseToken: token } });
  if (worker) return toResolvedWorker(worker);
  return null;
}

/** Same lookup as above, by kind + row id — used by the ERP-authenticated
 * supervisor route, which already knows exactly which row it's acting on
 * and shouldn't need to round-trip through a token. */
export async function resolveShiftResponseById(kind: ShiftResponseKind, id: string): Promise<ResolvedShiftResponse | null> {
  if (kind === "day") {
    const day = await prisma.projectDayAssignment.findUnique({ where: { id } });
    return day ? toResolvedDay(day) : null;
  }
  const worker = await prisma.projectWorkerDayAssignment.findUnique({ where: { id } });
  return worker ? toResolvedWorker(worker) : null;
}

/** The single place that actually writes responseStatus/respondedAt.
 * Throws ShiftAlreadyPassedError if the shift's date has already gone by —
 * both call sites (the public token route and the ERP supervisor route)
 * let this propagate as their own 409, rather than each re-checking isPast
 * themselves. */
export async function recordShiftResponse(
  kind: ShiftResponseKind,
  id: string,
  action: "accept" | "decline"
): Promise<ResolvedShiftResponse> {
  const resolved = await resolveShiftResponseById(kind, id);
  if (!resolved) throw new Error("Assignment not found");
  if (resolved.isPast) throw new ShiftAlreadyPassedError();

  const status: ShiftResponseStatus = action === "accept" ? "ACCEPTED" : "DECLINED";
  const respondedAt = new Date();
  if (kind === "day") {
    await prisma.projectDayAssignment.update({ where: { id }, data: { responseStatus: status, respondedAt } });
  } else {
    await prisma.projectWorkerDayAssignment.update({ where: { id }, data: { responseStatus: status, respondedAt } });
  }
  return { ...resolved, status };
}
