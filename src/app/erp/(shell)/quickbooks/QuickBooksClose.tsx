"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/app/erp/components/ui";
import type { CloseMonth } from "@/lib/erp/qboClose";

function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Month close: how far QuickBooks is finished, and each month's checklist. */
export function QuickBooksClose({ months, bookedThrough }: { months: CloseMonth[]; bookedThrough: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function patch(body: Record<string, unknown>, key: string) {
    setSaving(key);
    setError("");
    try {
      const res = await fetch("/api/erp/quickbooks/close", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(null);
    }
  }

  if (!months.length) return null;
  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
          Month close
          <InfoTip
            text="Once QuickBooks is finished for a month, mark it done. The Finance dashboard only counts QuickBooks costs up to that month, so a half-booked month never skews profit. The checklist ticks itself from the QuickBooks data where it can; tick the rest by hand."
            wide
          />
        </h2>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          QuickBooks done through
          <select
            id="qbo-booked-through"
            value={bookedThrough ?? ""}
            disabled={saving === "booked"}
            onChange={(e) => patch({ bookedThrough: e.target.value || null }, "booked")}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          >
            <option value="">Not set (every finished month)</option>
            {months.map((m) => (
              <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {months.map((m) => {
          const done = m.items.filter((i) => i.done).length;
          const isBooked = !!bookedThrough && m.month <= bookedThrough;
          const allDone = done === m.items.length;
          return (
            <div key={m.month} className="rounded-md border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{monthLabel(m.month)}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${allDone ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                  {done} of {m.items.length} done
                </span>
                {isBooked ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Marked done</span> : null}
                {!m.hasData ? <span className="text-[11px] text-gray-400">No QuickBooks data yet</span> : null}
                {allDone && !isBooked ? (
                  <button
                    type="button"
                    onClick={() => patch({ bookedThrough: m.month }, "booked")}
                    disabled={saving !== null}
                    className="ml-auto rounded-md bg-pink-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-50"
                  >
                    Mark done through {monthLabel(m.month).split(" ")[0]}
                  </button>
                ) : null}
              </div>
              <ul className="mt-2 space-y-1.5">
                {m.items.map((i) => {
                  const id = `close-${m.month}-${i.key}`;
                  const fromData = i.auto === true;
                  return (
                    <li key={i.key} className="flex items-start gap-2 text-sm">
                      <input
                        id={id}
                        type="checkbox"
                        checked={i.done}
                        disabled={fromData || saving === id}
                        onChange={(e) => patch({ month: m.month, item: i.key, done: e.target.checked }, id)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-pink-600 disabled:opacity-60"
                      />
                      <div className="min-w-0">
                        <label htmlFor={id} className={i.done ? "text-gray-500" : "text-gray-900"}>{i.label}</label>
                        <span className="ml-1 inline-block align-middle"><InfoTip text={i.hint} /></span>
                        {fromData ? <span className="ml-2 text-[11px] text-emerald-700">from the data</span> : null}
                        {i.manual ? <span className="ml-2 text-[11px] text-gray-400">ticked by {i.manual.by?.split("@")[0] ?? "someone"}, {when(i.manual.at)}</span> : null}
                        {!i.done && i.detail ? <p className="text-xs text-amber-700">{i.detail}</p> : null}
                        {!i.done && i.auto === null && i.key !== "reviewed" ? <p className="text-xs text-gray-400">Can&apos;t check yet, needs a QuickBooks sync</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
