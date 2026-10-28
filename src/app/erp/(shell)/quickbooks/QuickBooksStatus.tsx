"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QboStatus } from "@/lib/erp/qboStatus";

function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function prevMonth(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** The one status: everything matches, or a few plain sentences, plus closing the month. */
export function QuickBooksStatus({ status, firstMonth }: { status: QboStatus; /** The ERP's data start, the earliest month that can be closed */ firstMonth: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const ok = status.items.length === 0;

  async function setBooked(month: string | null) {
    setBusy(true);
    try {
      await fetch("/api/erp/quickbooks/close", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookedThrough: month }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`space-y-3 rounded-lg border p-5 shadow-sm ${ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <h2 className={`text-lg font-semibold ${ok ? "text-emerald-800" : "text-amber-900"}`}>
        {ok ? "Everything matches" : `${status.items.length + status.more} thing${status.items.length + status.more === 1 ? "" : "s"} to fix`}
      </h2>
      {ok ? (
        <p className="text-sm text-emerald-800">The ERP and QuickBooks agree on money owed and on every month that isn&apos;t closed yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-gray-800">
          {status.items.map((i, n) => (
            <li key={n} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>
                {i.text}
                {i.href ? (
                  <>
                    {" "}
                    <Link href={i.href} className="font-medium text-pink-600 hover:underline">See why</Link>
                  </>
                ) : null}
              </span>
            </li>
          ))}
          {status.more > 0 ? <li className="pl-3.5 text-gray-500">and {status.more} more on the details page</li> : null}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-3 text-sm">
        <span className="text-gray-700">
          {status.bookedThrough ? <>Closed through <strong>{monthLabel(status.bookedThrough)}</strong></> : "No month closed yet"}
        </span>
        {status.nextToClose ? (
          <button
            type="button"
            onClick={() => setBooked(status.nextToClose)}
            disabled={busy}
            className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-50"
            title="Mark QuickBooks as done for this month. The Finance dashboard then counts its QuickBooks costs as final."
          >
            Close {monthLabel(status.nextToClose)}
          </button>
        ) : null}
        {status.bookedThrough ? (
          <button type="button" onClick={() => setBooked(prevMonth(status.bookedThrough!) < firstMonth ? null : prevMonth(status.bookedThrough!))} disabled={busy} className="text-xs text-gray-500 hover:text-gray-800 hover:underline">
            Undo
          </button>
        ) : null}
      </div>
    </section>
  );
}
