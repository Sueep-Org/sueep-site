import Link from "next/link";
import { formatLienDay, lienPillLabel } from "@/lib/erp/lienDeadline";
import type { LienWatchRow } from "@/lib/erp/lienWatch";

const LEVEL_CLS = {
  OK: "bg-gray-100 text-gray-600",
  SOON: "bg-amber-100 text-amber-700",
  URGENT: "bg-red-100 text-red-700",
  PASSED: "bg-red-600 text-white",
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
  if (d.noticeLabel && d.noticeByKey) parts.push(`${d.noticeLabel} due by ${formatLienDay(d.noticeByKey)}.`);
  if (row.completedKey) parts.push(`Completed ${formatLienDay(row.completedKey)}.`);
  if (row.unpaidCents > 0) parts.push(`${money(row.unpaidCents)} unpaid.`);
  if (row.stateSource === "SITE_ADDRESS") parts.push(`${row.state} read from the site address.`);
  if (row.stateSource === "TITLE") parts.push(`${row.state} read from the job title.`);
  if (d.roleAssumed) parts.push("Who hired us isn't set, so the stricter rule is used.");
  return parts.join(" ");
}

/** Pill showing how long is left to file a lien on an unpaid job. Links to where it's set up. */
export function LienDeadlinePill({ row, className = "" }: { row: LienWatchRow | undefined; className?: string }) {
  if (!row) return null;
  // State and who hired us live on Financials; the completion date lives in Project Setup.
  const href = row.missing === "NO_END_DATE" ? `/erp/projects/${row.projectId}` : `/erp/projects/${row.projectId}?tab=Financials`;
  if (!row.deadline) {
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
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold hover:underline ${LEVEL_CLS[row.deadline.level]} ${className}`}
    >
      {lienPillLabel(row.deadline)}
    </Link>
  );
}
