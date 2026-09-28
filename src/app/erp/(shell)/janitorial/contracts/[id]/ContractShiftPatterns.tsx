import Link from "next/link";
import { WEEKDAY_SHORT, formatTime12, shiftHours } from "@/lib/erp/janitorialSchedule";
import { formatHours, formatShortDate } from "@/lib/erp/schedule";
import { todayEasternKey } from "@/lib/erp/dates";

export type PatternRow = {
  id: string;
  employeeName: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  notes: string | null;
};

function daysLabel(days: number[]): string {
  const sorted = [...days].sort();
  if (sorted.join() === "1,2,3,4,5") return "Mon to Fri";
  if (sorted.length === 7) return "Every day";
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

/** Read-only summary of who's scheduled at this building each week. Shifts
 * are added and changed on the Schedule page's Janitorial calendar. */
export function ContractShiftPatterns({ contractId, patterns }: { contractId: string; patterns: PatternRow[] }) {
  const today = todayEasternKey();
  const current = patterns.filter((p) => !p.effectiveUntil || p.effectiveUntil.slice(0, 10) >= today);
  const weeklyHours = current
    .filter((p) => p.effectiveFrom.slice(0, 10) <= today)
    .reduce((s, p) => s + p.daysOfWeek.length * shiftHours(p.startTime, p.endTime), 0);
  const calendarHref = `/erp/schedule?calendar=janitorial&contract=${contractId}`;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Weekly schedule</h2>
          <p className="text-xs text-gray-500">
            {current.length === 0 ? "No janitors scheduled yet." : `${formatHours(weeklyHours)} scheduled per week.`}
          </p>
        </div>
        <Link href={calendarHref} className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500">
          {current.length === 0 ? "Schedule janitors" : "Open in calendar"}
        </Link>
      </div>

      {current.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {current.map((p) => {
            const upcoming = p.effectiveFrom.slice(0, 10) > today;
            return (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{p.employeeName}</p>
                  <p className="text-sm text-gray-600">
                    {daysLabel(p.daysOfWeek)}, {formatTime12(p.startTime)} to {formatTime12(p.endTime)}
                    {p.notes ? <span className="text-gray-400"> · {p.notes}</span> : null}
                  </p>
                </div>
                <p className="text-xs text-gray-500">
                  {formatHours(shiftHours(p.startTime, p.endTime) * p.daysOfWeek.length)}/week
                  {upcoming ? `, starts ${formatShortDate(p.effectiveFrom.slice(0, 10))}` : ""}
                  {p.effectiveUntil ? `, until ${formatShortDate(p.effectiveUntil.slice(0, 10))}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
