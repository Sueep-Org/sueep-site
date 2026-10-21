"use client";

import type { AnswerStatus } from "@/lib/erp/scheduleAnswerUids";

export { answerUid, type AnswerStatus, type Answers } from "@/lib/erp/scheduleAnswerUids";

const MARK: Record<"CONFIRMED" | "DECLINED" | "PENDING", { label: string; dot: string }> = {
  CONFIRMED: { label: "Accepted", dot: "bg-emerald-500" },
  DECLINED: { label: "Declined", dot: "bg-red-600" },
  PENDING: { label: "Pending", dot: "bg-gray-400" },
};

/** Green accepted, red declined, gray pending. Nothing when no invite went out. White ring so it shows on any chip color. */
export function AnswerDot({ status, title }: { status: AnswerStatus | undefined; title?: string }) {
  if (!status || status === "CANCELLED") return null;
  const m = MARK[status];
  return (
    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-white ${m.dot}`} title={title ?? m.label}>
      <span className="sr-only">{title ?? m.label}</span>
    </span>
  );
}

/** A dot after a person's name. `dark` is kept for the gray tooltip callers. */
export function AnswerMark({ status }: { status: AnswerStatus | undefined; dark?: boolean }) {
  if (!status || status === "CANCELLED") return null;
  return (
    <span className="ml-1 inline-flex items-center">
      <AnswerDot status={status} />
    </span>
  );
}

/** "2 accepted, 1 declined, 1 pending" for a day's crew; null when no invites went out. */
export function answersSummary(statuses: (AnswerStatus | undefined)[]): string | null {
  const n = (s: AnswerStatus) => statuses.filter((x) => x === s).length;
  const parts = [n("CONFIRMED") && `${n("CONFIRMED")} accepted`, n("DECLINED") && `${n("DECLINED")} declined`, n("PENDING") && `${n("PENDING")} pending`].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** "Nelson Martinez ● Pending" under a popover's coverage pickers, for the saved supervisor or sub running the day. */
export function CoverageAnswer({ name, status }: { name: string | null | undefined; status: AnswerStatus | undefined }) {
  if (!name || !status || status === "CANCELLED") return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
      {name}
      <AnswerDot status={status} />
      <span>{MARK[status].label}</span>
    </p>
  );
}
