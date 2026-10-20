"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { value: string; label: string };

/**
 * Win/loss filter button: period and type of work, kept in the URL. Same look
 * as the other ERP filter menus (Billing, Schedule): an icon that turns pink
 * when anything other than the default is picked.
 */
export function WinLossFilter({
  period,
  scope,
  periods,
  scopes,
  defaultPeriod,
}: {
  period: string;
  /** "" for all work */
  scope: string;
  periods: Option[];
  scopes: Option[];
  defaultPeriod: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = useId();
  const active = period !== defaultPeriod || scope !== "";

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function go(next: { period?: string; scope?: string }) {
    const p = next.period ?? period;
    const s = next.scope ?? scope;
    router.push(`/erp/win-loss?period=${p}${s ? `&type=${s}` : ""}`);
  }

  const radios = (title: string, group: string, options: Option[], value: string, onPick: (v: string) => void) => (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="mt-1.5 space-y-1">
        {options.map((opt) => (
          <label key={opt.value || "all"} className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="radio"
              name={`${name}-${group}`}
              checked={value === opt.value}
              onChange={() => onPick(opt.value)}
              className="h-3.5 w-3.5 border-gray-300 text-pink-600 focus:ring-pink-400"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Filter"
        aria-expanded={open}
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
          active ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          {radios("Period", "period", periods, period, (v) => go({ period: v }))}
          <div className="my-3 border-t border-gray-100" />
          {radios("Type of work", "scope", scopes, scope, (v) => go({ scope: v }))}
          {active && (
            <>
              <div className="my-3 border-t border-gray-100" />
              <button type="button" onClick={() => go({ period: defaultPeriod, scope: "" })} className="text-xs text-pink-600 hover:underline">
                Reset filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
