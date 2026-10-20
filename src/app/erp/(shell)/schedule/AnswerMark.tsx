"use client";

import type { AnswerStatus } from "@/lib/erp/scheduleAnswerUids";

export { answerUid, type AnswerStatus, type Answers } from "@/lib/erp/scheduleAnswerUids";

const MARK: Record<"CONFIRMED" | "DECLINED" | "PENDING", { symbol: string; label: string; light: string; dark: string }> = {
  CONFIRMED: { symbol: "✓", label: "Confirmed", light: "text-emerald-600", dark: "text-emerald-300" },
  DECLINED: { symbol: "✕", label: "Can't make it", light: "text-red-600", dark: "text-red-300" },
  PENDING: { symbol: "?", label: "No answer yet", light: "text-gray-400", dark: "text-gray-400" },
};

/** ✓ confirmed, ✕ can't make it, ? no answer yet. Nothing when no invite went out. `dark` for the gray tooltip. */
export function AnswerMark({ status, dark = false }: { status: AnswerStatus | undefined; dark?: boolean }) {
  if (!status || status === "CANCELLED") return null;
  const m = MARK[status];
  return (
    <span className={`ml-1 font-bold ${dark ? m.dark : m.light}`} title={m.label}>
      {m.symbol}
      <span className="sr-only"> {m.label}</span>
    </span>
  );
}

/** "2 confirmed, 1 can't make it, 1 no answer" for a day's crew; null when no invites went out. */
export function answersSummary(statuses: (AnswerStatus | undefined)[]): string | null {
  const n = (s: AnswerStatus) => statuses.filter((x) => x === s).length;
  const parts = [n("CONFIRMED") && `${n("CONFIRMED")} confirmed`, n("DECLINED") && `${n("DECLINED")} can't make it`, n("PENDING") && `${n("PENDING")} no answer`].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
