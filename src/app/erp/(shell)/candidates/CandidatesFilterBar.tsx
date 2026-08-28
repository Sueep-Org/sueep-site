"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  search: string;
  status: string;
  position: string;
  type: string;
};

const STATUSES = ["APPLIED", "INTERVIEWING", "ONBOARDING", "DENIED"];
const POSITIONS = ["Cleaner", "Painter", "Supervisor"];

const inputCls = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-gray-400";

export function CandidatesFilterBar({ search, status, position, type }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtersActive = Boolean(status || position || type);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Filter candidates"
        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
          filtersActive
            ? "border-pink-300 bg-pink-50 text-pink-600"
            : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <form className="space-y-3">
            {/* Search by name lives outside this popover (always visible in
                the header) — preserved here as a hidden field so clicking
                Apply doesn't silently clear whatever name search is active,
                same reasoning as EmployeesFilterBar's hidden "name" field. */}
            <input type="hidden" name="search" value={search} />
            <div>
              <label className={labelCls} htmlFor="statusFilter">Status</label>
              <select id="statusFilter" name="status" defaultValue={status} className={inputCls}>
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="positionFilter">Position</label>
              <select id="positionFilter" name="position" defaultValue={position} className={inputCls}>
                <option value="">All positions</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="typeFilter">Type</label>
              <select id="typeFilter" name="type" defaultValue={type} className={inputCls}>
                <option value="">All types</option>
                <option value="subcontractor">Subcontractor</option>
                <option value="individual">Individual</option>
              </select>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-500"
              >
                Apply
              </button>
              {filtersActive ? (
                <Link
                  href={search ? `/erp/candidates?search=${encodeURIComponent(search)}` : "/erp/candidates"}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
