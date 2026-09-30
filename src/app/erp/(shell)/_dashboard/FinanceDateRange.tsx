"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const dateCls = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

/** "Custom dates" option for the Finance tab's period control: click, pick
 * a from/to date, Apply. Shows the applied range as its label. */
export function FinanceDateRange({
  range,
  label,
  today,
  byPaid,
}: {
  /** The range currently shown, if any. */
  range: { from: string; to: string } | null;
  /** Button text when a range is applied ("Aug 1 - Aug 7, 2026"). */
  label: string | null;
  /** "YYYY-MM-DD", the latest day that can be picked. */
  today: string;
  byPaid: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range?.from ?? `${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(range?.to ?? today);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !e.composedPath().includes(ref.current)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const active = range != null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`rounded-md px-3 py-1 text-xs font-medium transition ${
          active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
        }`}
      >
        {label ?? "Custom dates"}
      </button>
      {open && (
        <form
          className="absolute left-0 z-20 mt-2 w-60 space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            router.push(`/erp?tab=finance&period=${from}..${to}${byPaid ? "&by=paid" : ""}`);
          }}
        >
          <label className="block text-xs text-gray-500">
            From
            <input type="date" required className={`${dateCls} mt-1`} value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block text-xs text-gray-500">
            To
            <input type="date" required className={`${dateCls} mt-1`} value={to} max={today} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button type="submit" className="w-full rounded-md bg-gray-900 py-1.5 text-sm font-medium text-white hover:bg-gray-700">
            Apply
          </button>
        </form>
      )}
    </div>
  );
}
