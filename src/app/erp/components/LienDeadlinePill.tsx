import Link from "next/link";
import { formatLienDay, lienDecisionCloses, lienPillLabel } from "@/lib/erp/lienDeadline";
import type { LienWatchRow } from "@/lib/erp/lienWatch";

const STAGE_CLS = {
  NOT_DUE: "bg-gray-100 text-gray-600",
  PAST_DUE: "bg-amber-100 text-amber-700",
  DECIDE_NOW: "bg-orange-100 text-orange-800",
  NOTICE_DUE: "bg-red-100 text-red-700",
  NOTICE_MISSED: "bg-red-600 text-white",
  TOO_LATE: "bg-red-600 text-white",
} as const;

const MISSING_TEXT = {
  STATE: { label: "Set lien info", detail: "No state found in the site address or job title. Set it on the project to see the lien deadline." },
  NOT_COMPLETE: { label: "Not complete yet", detail: "The lien clock starts when the project is marked complete." },
  NO_END_DATE: { label: "No completion date", detail: "Add the End date in Project Setup to start the lien clock." },
} as const;

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Everything behind a lien pill, as hover text. */
export function lienDetailText(row: LienWatchRow): string {
  const d = row.deadline;
  if (!d) return MISSING_TEXT[row.missing ?? "STATE"].detail;
  const parts = [`File by ${formatLienDay(d.deadlineKey)}.`];
  if (d.daysLeft >= 0) parts.push(`Decide by ${formatLienDay(d.decideByKey)}.`);
  if (d.noticeLabel && d.noticeByKey) {
    parts.push(row.noticeSentKey ? `${d.noticeLabel} sent ${formatLienDay(row.noticeSentKey)}.` : `${d.noticeLabel} due by ${formatLienDay(d.noticeByKey)}.`);
  }
  if (row.readiness?.daysOverdue != null) parts.push(`Oldest invoice ${row.readiness.daysOverdue}d past due.`);
  if (row.completedKey) parts.push(`Completed ${formatLienDay(row.completedKey)}.`);
  if (row.unpaidCents > 0) parts.push(`${money(row.unpaidCents)} unpaid.`);
  if (row.stateSource === "SITE_ADDRESS") parts.push(`${row.state} read from the site address.`);
  if (row.stateSource === "TITLE") parts.push(`${row.state} read from the job title.`);
  if (row.decision?.value === "PURSUING") parts.push("Marked as pursuing.");
  if (d.roleAssumed) parts.push("Who hired us isn't set, so the stricter rule is used.");
  return parts.join(" ");
}

/**
 * Small warning mark for beside a job's name, shown only when its lien
 * status needs a look: amber once an invoice is late, red from the day to
 * decide onward. Nothing for jobs that aren't due, are decided, or are
 * only missing setup.
 */
export function LienWarningIcon({ row, className = "" }: { row: LienWatchRow | undefined; className?: string }) {
  if (!row?.deadline || !row.readiness || row.readiness.stage === "NOT_DUE" || lienDecisionCloses(row.decision?.value)) return null;
  const urgent = row.readiness.stage !== "PAST_DUE";
  const label = lienPillLabel(row.deadline, row.readiness);
  return (
    <Link
      href={`/erp/projects/${row.projectId}?tab=Liens`}
      title={`${label}. ${lienDetailText(row)}`}
      aria-label={label}
      className={`inline-flex align-middle ${urgent ? "text-red-600" : "text-amber-500"} hover:opacity-70 ${className}`}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        />
      </svg>
    </Link>
  );
}

/** Pill showing how long is left to file a lien on an unpaid job. Links to where it's set up. */
export function LienDeadlinePill({ row, className = "" }: { row: LienWatchRow | undefined; className?: string }) {
  if (!row) return null;
  // State and who hired us live on the Liens tab; the completion date lives in Project Setup.
  const href = row.missing === "NO_END_DATE" ? `/erp/projects/${row.projectId}` : `/erp/projects/${row.projectId}?tab=Liens`;
  if (row.decision && lienDecisionCloses(row.decision.value)) {
    const filed = row.decision.value === "FILED";
    return (
      <Link
        href={href}
        title={[row.decision.by ? `Set by ${row.decision.by.split("@")[0]}` : "", row.decision.onKey ? `on ${formatLienDay(row.decision.onKey)}.` : "", row.decision.note ?? ""].filter(Boolean).join(" ")}
        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold hover:underline ${filed ? "bg-sky-100 text-sky-700" : "bg-gray-100 text-gray-500"} ${className}`}
      >
        {filed ? "Lien filed" : "Not pursuing a lien"}
      </Link>
    );
  }
  if (!row.deadline || !row.readiness) {
    return (
      <Link
        href={href}
        title={lienDetailText(row)}
        className={`inline-block rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-500 hover:border-pink-400 hover:text-pink-600 ${className}`}
      >
        {MISSING_TEXT[row.missing ?? "STATE"].label}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      title={lienDetailText(row)}
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold hover:underline ${STAGE_CLS[row.readiness.stage]} ${className}`}
    >
      {lienPillLabel(row.deadline, row.readiness)}
    </Link>
  );
}
