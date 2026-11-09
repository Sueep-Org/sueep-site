"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OptionCombobox } from "@/app/erp/components/OptionCombobox";
import { inputClass } from "@/app/erp/components/ui";
import { todayEasternKey } from "@/lib/erp/dates";
import { STATUS_STYLE } from "./status";
import { logHref, type LogFilterValues } from "./filters";

type Option = { value: string; label: string };

const dayText = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Quick date ranges, Eastern days. */
function datePresets(): { label: string; from: string; until: string }[] {
  const today = todayEasternKey();
  const [y, m] = today.split("-").map(Number) as [number, number];
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastMonthStart = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
  return [
    { label: "Today", from: today, until: today },
    { label: "Last 7 days", from: addDays(today, -6), until: "" },
    { label: "This month", from: monthStart, until: "" },
    { label: "Last month", from: lastMonthStart, until: addDays(monthStart, -1) },
  ];
}

/** Email Log search plus one Filter button (status, type, project, recipient, dates, extras); active filters show as chips. Kept in the URL. */
export function LogFilters({ filters, total, typeOptions, aboutOptions }: { filters: LogFilterValues; total: number; typeOptions: Option[]; aboutOptions: Option[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState(filters.q);
  const [recipient, setRecipient] = useState(filters.to);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      // The pickers' lists sit inside the menu, so only close on clicks outside the whole menu.
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function go(next: Partial<LogFilterValues>) {
    router.push(logHref({ ...filters, q: subject, to: recipient, ...next }));
  }

  function clearAll() {
    setRecipient("");
    router.push(logHref({ q: subject }));
  }

  const label = (list: Option[], v: string) => list.find((o) => o.value === v)?.label ?? v;
  const chips: { label: string; clear: Partial<LogFilterValues> }[] = [
    ...(filters.status ? [{ label: STATUS_STYLE[filters.status]?.label ?? filters.status, clear: { status: "" } }] : []),
    ...(filters.type ? [{ label: label(typeOptions, filters.type), clear: { type: "" } }] : []),
    ...(filters.about ? [{ label: label(aboutOptions, filters.about), clear: { about: "" } }] : []),
    ...(filters.to ? [{ label: `To: ${filters.to}`, clear: { to: "" } }] : []),
    ...(filters.from || filters.until
      ? [
          {
            label: filters.from && filters.until ? (filters.from === filters.until ? dayText(filters.from) : `${dayText(filters.from)} to ${dayText(filters.until)}`) : filters.from ? `Since ${dayText(filters.from)}` : `Until ${dayText(filters.until)}`,
            clear: { from: "", until: "" },
          },
        ]
      : []),
    ...(filters.attach ? [{ label: "Has attachments", clear: { attach: "" } }] : []),
    ...(filters.resent ? [{ label: "Resent", clear: { resent: "" } }] : []),
  ];

  const heading = "text-[10px] font-semibold uppercase tracking-wide text-gray-400";
  const option = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs ${on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({});
        }}
      >
        <input
          type="search"
          className={`${inputClass.sm} w-full sm:w-72`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Search subject, press Enter"
          aria-label="Search subject"
        />
      </form>

      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium ${
            chips.length ? "border-pink-300 bg-pink-50 text-pink-700" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3" />
          </svg>
          Filter{chips.length ? ` (${chips.length})` : ""}
        </button>
        {open && (
          <div className="absolute left-0 z-20 mt-2 w-80 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
            <div>
              <p className={heading}>Status</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => go({ status: "" })} className={option(!filters.status)}>
                  All
                </button>
                {Object.entries(STATUS_STYLE).map(([value, s]) => (
                  <button key={value} type="button" title={s.hint} onClick={() => go({ status: value })} className={option(filters.status === value)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={heading}>Email</p>
              <OptionCombobox options={typeOptions} value={filters.type} onChange={(v) => go({ type: v })} allLabel="All emails" placeholder="Type or area, e.g. Billing" />
            </div>

            <div>
              <p className={heading}>Project or building</p>
              <OptionCombobox options={aboutOptions} value={filters.about} onChange={(v) => go({ about: v })} allLabel="Any project or building" />
            </div>

            <div>
              <p className={heading}>Recipient</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  go({});
                }}
              >
                <input
                  className={`${inputClass.sm} mt-1.5`}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  onBlur={() => recipient.trim() !== filters.to && go({})}
                  placeholder="Part of an email, e.g. jennifer"
                  aria-label="Recipient"
                  title="Matches To, Cc and Bcc."
                />
              </form>
            </div>

            <div>
              <p className={heading}>Sent</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {datePresets().map((d) => (
                  <button key={d.label} type="button" onClick={() => go({ from: d.from, until: d.until })} className={option(filters.from === d.from && filters.until === d.until)}>
                    {d.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <input type="date" aria-label="From" value={filters.from} max={filters.until || undefined} onChange={(e) => go({ from: e.target.value })} className={`${inputClass.sm} flex-1`} />
                to
                <input type="date" aria-label="To" value={filters.until} min={filters.from || undefined} onChange={(e) => go({ until: e.target.value })} className={`${inputClass.sm} flex-1`} />
              </div>
            </div>

            <div>
              <p className={heading}>Only</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => go({ attach: filters.attach ? "" : "1" })} className={option(filters.attach === "1")}>
                  Has attachments
                </button>
                <button type="button" title="Copies sent again from this log" onClick={() => go({ resent: filters.resent ? "" : "1" })} className={option(filters.resent === "1")}>
                  Resent
                </button>
              </div>
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-3">
              <button type="button" onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-800">
                Clear all
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-pink-600 hover:text-pink-700">
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {chips.map((c) => (
        <span key={c.label} className="inline-flex items-center gap-1 rounded-full bg-pink-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-pink-700">
          {c.label}
          <button
            type="button"
            aria-label={`Remove ${c.label}`}
            onClick={() => {
              if (c.clear.to !== undefined) setRecipient("");
              go(c.clear);
            }}
            className="rounded-full px-1 hover:bg-pink-100"
          >
            ×
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button type="button" onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-800">
          Clear all
        </button>
      )}

      <span className="ml-auto text-xs text-gray-500">
        {total.toLocaleString()} {total === 1 ? "email" : "emails"}
      </span>
    </div>
  );
}
