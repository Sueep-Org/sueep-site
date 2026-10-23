"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, InfoTip } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { AWARD_OPTIONS, BID_OPTIONS, FLAG_GROUPS, PRIORITY_FILTER, SORT_OPTIONS, type Filters, type Flag } from "./filters";

type Option = { value: string; label: string };

const LABEL = "text-[10px] font-semibold uppercase tracking-wide text-gray-400";
const RADIO = "h-3.5 w-3.5 border-gray-300 text-pink-600 focus:ring-pink-400";
const DATE =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

/** From and To boxes for a custom date range. */
function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 pt-1">
      <label className="block text-xs text-gray-700">
        From
        <input type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} className={DATE} />
      </label>
      <label className="block text-xs text-gray-700">
        To
        <input type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} className={DATE} />
      </label>
    </div>
  );
}

function Section({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <>
      <div className="my-3 border-t border-gray-100 first:hidden" />
      <p className={`${LABEL} flex items-center gap-1`}>
        {title}
        {info && <InfoTip align="right" text={info} />}
      </p>
      <div className="mt-1.5 space-y-1">{children}</div>
    </>
  );
}

function Radios<T extends string>({
  name,
  value,
  options,
  onPick,
}: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <>
      {options.map((o) => (
        <label key={o.value || "all"} className="flex items-center gap-2 text-xs text-gray-700">
          <input type="radio" name={name} checked={value === o.value} onChange={() => onPick(o.value)} className={RADIO} />
          {o.label}
        </label>
      ))}
    </>
  );
}

/**
 * The filter button and menu, same look as Win/Loss and Billing: the icon
 * turns pink when anything differs from the starting view. Owner and company
 * are searchable dropdowns; Only show is grouped.
 */
export function FilterMenu({
  filters,
  update,
  active,
  onReset,
  ownerOptions,
  gcOptions,
  scopes,
  isJan,
  companyWord,
  closed,
  onClosed,
  closedDays,
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  active: boolean;
  onReset: () => void;
  ownerOptions: Option[];
  gcOptions: Option[];
  scopes: Option[];
  isJan: boolean;
  companyWord: string;
  closed: "recent" | "all";
  onClosed: (v: "recent" | "all") => void;
  closedDays: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = useId();

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const toggle = (flag: Flag, on: boolean) => update({ flags: on ? [...filters.flags, flag] : filters.flags.filter((x) => x !== flag) });
  const companies = companyWord === "GC" ? "GCs" : "companies";

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
        <div className="absolute right-0 z-20 mt-2 max-h-[80vh] w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <Section title="Owner">
            <SearchableSelect
              value={filters.owner}
              onChange={(v) => update({ owner: v })}
              options={ownerOptions}
              allLabel="All owners"
              placeholder="All owners"
            />
          </Section>
          <Section title={companyWord}>
            <SearchableSelect
              value={filters.gc}
              onChange={(v) => update({ gc: v })}
              options={gcOptions}
              allLabel={`All ${companies}`}
              placeholder={`All ${companies}`}
            />
          </Section>
          <Section title="Priority" info="HubSpot's deal Priority. High shows a flame on the card.">
            <Radios name={`${name}-priority`} value={filters.priority} onPick={(v) => update({ priority: v })} options={PRIORITY_FILTER} />
          </Section>
          <Section
            title="Company type"
            info="GCs: general contractors. Property managers and owners: clients who hire us directly. Not linked: a company name that matches no company in the ERP. No company: none on the deal."
          >
            <Radios
              name={`${name}-kind`}
              value={filters.kind}
              onPick={(v) => update({ kind: v })}
              options={[
                { value: "", label: "All" },
                { value: "gc", label: "GCs" },
                { value: "client", label: "Property managers and owners" },
                { value: "unlinked", label: "Not linked" },
                { value: "none", label: "No company" },
              ]}
            />
          </Section>
          {!isJan && (
            <Section title="Type of work">
              <Radios
                name={`${name}-scope`}
                value={filters.scope}
                onPick={(v) => update({ scope: v })}
                options={[{ value: "", label: "All work" }, ...scopes]}
              />
            </Section>
          )}
          <Section
            title="Bid due"
            info="HubSpot's Bid Date. Past due: the bid date has passed and the deal is still open. Picking a range sorts cards by bid date, soonest first."
          >
            <Radios name={`${name}-bid`} value={filters.bid} onPick={(v) => update({ bid: v })} options={BID_OPTIONS} />
            {filters.bid === "custom" && (
              <DateRange from={filters.bidFrom} to={filters.bidTo} onFrom={(v) => update({ bidFrom: v })} onTo={(v) => update({ bidTo: v })} />
            )}
          </Section>
          {!isJan && (
            <Section
              title="Award date"
              info="HubSpot's Award Date, when the GC expects to award the job. Picking a range sorts cards by award date, soonest first."
            >
              <Radios name={`${name}-award`} value={filters.award} onPick={(v) => update({ award: v })} options={AWARD_OPTIONS} />
              {filters.award === "custom" && (
                <DateRange from={filters.awardFrom} to={filters.awardTo} onFrom={(v) => update({ awardFrom: v })} onTo={(v) => update({ awardTo: v })} />
              )}
            </Section>
          )}
          <Section
            title="Sort"
            info={`Order of the cards in each column. Recent activity: deals touched most recently on top.${isJan ? "" : " Chance to win: best odds on top."} Bid date: soonest first, no date last. Longest in stage: most days in the current stage first.`}
          >
            <Radios name={`${name}-sort`} value={filters.sortBy} onPick={(v) => update({ sortBy: v })} options={SORT_OPTIONS.filter((o) => !isJan || !o.postConOnly)} />
          </Section>
          <Section title="Older deals" info={`Lead, won and lost stages show deals created or active in the last ${closedDays} days unless All is picked.`}>
            <Radios
              name={`${name}-closed`}
              value={closed}
              onPick={onClosed}
              options={[
                { value: "recent", label: `Last ${closedDays} days` },
                { value: "all", label: "All" },
              ]}
            />
          </Section>
          {FLAG_GROUPS.filter((g) => !isJan || !g.postConOnly).map((g) => (
            <Section key={g.title} title={g.title} info={`${g.info} Cards must match everything ticked.`}>
              {g.flags
                .filter((f) => !isJan || !["whoWon", "rebid"].includes(f.value))
                .map((f) => (
                  <label key={f.value} className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={filters.flags.includes(f.value)}
                      onChange={(e) => toggle(f.value, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                    />
                    {f.label}
                  </label>
                ))}
            </Section>
          ))}
          {active && (
            <>
              <div className="my-3 border-t border-gray-100" />
              <Button variant="ghost" size="xs" onClick={onReset}>
                Reset filters
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
