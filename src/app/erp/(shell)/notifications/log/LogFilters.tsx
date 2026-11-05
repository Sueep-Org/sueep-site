"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { inputClass } from "@/app/erp/components/ui";
import { STATUS_STYLE } from "./status";
import { hasAnyFilter, logHref, type LogFilterValues } from "./filters";

type Option = { value: string; label: string };

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
        on ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

/** Email Log filters, kept in the URL so a filtered list can be shared or bookmarked. */
export function LogFilters({ filters, total, typeOptions, aboutOptions }: { filters: LogFilterValues; total: number; typeOptions: Option[]; aboutOptions: Option[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState(filters.q);
  const [recipient, setRecipient] = useState(filters.to);

  function go(next: Partial<LogFilterValues>) {
    router.push(logHref({ ...filters, q: subject, to: recipient, ...next }));
  }

  function clear() {
    setSubject("");
    setRecipient("");
    router.push(logHref({}));
  }

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({});
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <SearchableSelect
          value={filters.type}
          onChange={(v) => go({ type: v })}
          options={typeOptions}
          placeholder="Search email types…"
          allLabel="All emails"
          className="w-64"
        />
        <SearchableSelect
          value={filters.about}
          onChange={(v) => go({ about: v })}
          options={aboutOptions}
          placeholder="Search projects or buildings…"
          allLabel="Any project or building"
          className="w-64"
        />
        <input
          className={`${inputClass.xs} w-52`}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          onBlur={() => recipient.trim() !== filters.to && go({})}
          placeholder="Recipient, e.g. jennifer"
          aria-label="Recipient"
          title="Part of an email address. Matches To, Cc and Bcc."
        />
        <input
          className={`${inputClass.xs} w-52`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onBlur={() => subject.trim() !== filters.q && go({})}
          placeholder="Subject contains…"
          aria-label="Subject"
        />
        <button type="submit" className="sr-only">
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {[["", "All"], ...Object.entries(STATUS_STYLE).map(([k, v]) => [k, v.label])].map(([value, label]) => (
            <Chip key={value} on={filters.status === value} onClick={() => go({ status: value })} title={STATUS_STYLE[value]?.hint}>
              {label}
            </Chip>
          ))}
        </div>
        <span className="h-4 w-px bg-gray-200" aria-hidden />
        <Chip on={filters.attach === "1"} onClick={() => go({ attach: filters.attach ? "" : "1" })}>
          Has attachments
        </Chip>
        <Chip on={filters.resent === "1"} onClick={() => go({ resent: filters.resent ? "" : "1" })} title="Copies sent again from this log">
          Resent
        </Chip>
        <span className="h-4 w-px bg-gray-200" aria-hidden />
        <label className="flex items-center gap-1 text-xs text-gray-500">
          From
          <input type="date" className={inputClass.xs} value={filters.from} max={filters.until || undefined} onChange={(e) => go({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          To
          <input type="date" className={inputClass.xs} value={filters.until} min={filters.from || undefined} onChange={(e) => go({ until: e.target.value })} />
        </label>
        <span className="ml-auto text-xs text-gray-500">
          {total.toLocaleString()} {total === 1 ? "email" : "emails"}
        </span>
        {hasAnyFilter(filters) && (
          <button type="button" onClick={clear} className="text-xs font-medium text-pink-600 hover:underline">
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
