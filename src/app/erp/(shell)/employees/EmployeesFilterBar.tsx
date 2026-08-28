"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type PayModeOption = { value: string; label: string; href: string };

type Props = {
  nameFilter: string;
  complianceFilter: string;
  backgroundCheckFilter: string;
  payTypeFilter: string;
  payModeOptions: PayModeOption[];
  sortBy: string;
  sortDir: string;
};

const inputCls = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-gray-400";

export function EmployeesFilterBar({
  nameFilter,
  complianceFilter,
  backgroundCheckFilter,
  payTypeFilter,
  payModeOptions,
  sortBy,
  sortDir,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtersActive = Boolean(nameFilter || complianceFilter || backgroundCheckFilter || payTypeFilter);

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
        aria-label="Filter employees"
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
                Apply doesn't silently clear whatever name search is active. */}
            <input type="hidden" name="name" value={nameFilter} />
            <div>
              <label className={labelCls} htmlFor="complianceFilter">Compliance</label>
              <select id="complianceFilter" name="compliance" defaultValue={complianceFilter} className={inputCls}>
                <option value="">All</option>
                <option value="COMPLIANT">Compliant</option>
                <option value="NON_COMPLIANT">Non-compliant</option>
                <option value="NOT_CONFIGURED">Not configured</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="backgroundCheckFilter">Background check</label>
              <select id="backgroundCheckFilter" name="backgroundCheck" defaultValue={backgroundCheckFilter} className={inputCls}>
                <option value="">All</option>
                <option value="PASSED">Passed</option>
                <option value="FAILED">Failed</option>
                <option value="PENDING">Pending</option>
                <option value="NOT_DONE">Not done</option>
              </select>
            </div>
            <div>
              <p className={labelCls}>Pay type</p>
              <div className="mt-1 flex rounded-md border border-gray-300 overflow-hidden text-sm">
                {payModeOptions.map((opt) => (
                  <Link
                    key={opt.value}
                    href={opt.href}
                    className={`flex-1 py-1.5 text-center font-medium transition-colors ${
                      payTypeFilter === opt.value ? "bg-pink-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {opt.label}
                  </Link>
                ))}
              </div>
            </div>

            <input type="hidden" name="payType" value={payTypeFilter} />
            <input type="hidden" name="sortBy" value={sortBy} />
            <input type="hidden" name="sortDir" value={sortDir} />

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-500"
              >
                Apply
              </button>
              {filtersActive ? (
                <Link
                  href="/erp/employees"
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
