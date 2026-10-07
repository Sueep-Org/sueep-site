"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import type { KnownUnit, PmBuilding, PmUnit, PmUnitStatus } from "@/lib/erp/propertyManagerCalendar";
import {
  REQUEST_LAYOUTS,
  REQUEST_WORK,
  changeDeadline,
  changeDeadlineLabel,
  estimateRequestCents,
  type RequestLayoutValue,
  type RequestWork,
} from "@/lib/erp/propertyManagerRequestShared";

const STATUS: Record<PmUnitStatus, { label: string; chip: string; dot: string }> = {
  REQUESTED: { label: "Requested", chip: "border border-dashed border-violet-400 bg-violet-50 text-violet-800", dot: "bg-violet-500" },
  IN_PROGRESS: { label: "Being worked on", chip: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  SCHEDULED: { label: "Booked", chip: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  ON_HOLD: { label: "On hold", chip: "bg-gray-200 text-gray-700", dot: "bg-gray-400" },
  DONE: { label: "Done", chip: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  DECLINED: { label: "Declined", chip: "bg-red-50 text-red-700", dot: "bg-red-400" },
};
const STATUS_ORDER: PmUnitStatus[] = ["REQUESTED", "IN_PROGRESS", "SCHEDULED", "ON_HOLD", "DONE", "DECLINED"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;
const DONE_LIST_STEP = 10;
/** "Coming up" shows booked turnovers this many days ahead. */
const COMING_UP_DAYS = 14;
const MAX_UNITS_PER_BOOKING = 10;

type View = "upcoming" | "month" | "list";
const VIEWS: { value: View; label: string }[] = [
  { value: "upcoming", label: "Coming up" },
  { value: "month", label: "Calendar" },
  { value: "list", label: "All" },
];
const VIEW_STORAGE_KEY = "sueep-pm-view";

/** Date keys are YYYY-MM-DD labels with no time zone, so all math stays in UTC. */
function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}
function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function formatKey(key: string | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return key ? keyToDate(key).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" }) : "";
}
function dateRange(unit: PmUnit): string {
  if (!unit.start) return "Date not set";
  if (!unit.end || unit.end === unit.start) return formatKey(unit.start, { weekday: "short", month: "short", day: "numeric" });
  return `${formatKey(unit.start)} to ${formatKey(unit.end)}`;
}
/** Same as the server's unit key: building plus unit number, ignoring case and a leading #. */
function unitKey(buildingId: string, unitNumber: string): string {
  return `${buildingId}|${unitNumber.trim().replace(/^#/, "").toLowerCase()}`;
}
function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
/** The unit is on the calendar every day from start through end. */
function coversDay(unit: PmUnit, key: string): boolean {
  if (!unit.start) return false;
  return unit.start <= key && key <= (unit.end && unit.end > unit.start ? unit.end : unit.start);
}

export function PmCalendar({
  token,
  firstName,
  buildings,
  units,
  knownUnits,
  today,
  contactEmail,
  sueepContact,
}: {
  token: string;
  firstName: string;
  buildings: PmBuilding[];
  units: PmUnit[];
  knownUnits: Record<string, KnownUnit>;
  today: string;
  contactEmail: string;
  /** Who at Sueep to call, set by staff */
  sueepContact: { name: string | null; phone: string | null; email: string | null };
}) {
  const router = useRouter();
  const [buildingId, setBuildingId] = useState(buildings.length === 1 ? buildings[0].id : "");
  const [view, setViewState] = useState<View>("upcoming");
  // Remember the last tab on this device. Storage can be blocked, so it's only a convenience.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "month" || saved === "list" || saved === "upcoming") setViewState(saved);
    } catch {
      // ignore
    }
  }, []);
  function setView(v: View) {
    setViewState(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      // ignore
    }
  }
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [openUnit, setOpenUnit] = useState<PmUnit | null>(null);
  const [doneShown, setDoneShown] = useState(DONE_LIST_STEP);
  /** The booking form, open with this start date ("" for none) */
  const [requestDate, setRequestDate] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const buildingName = useMemo(() => new Map(buildings.map((b) => [b.id, b.name])), [buildings]);
  const showBuilding = buildings.length > 1 && !buildingId;
  const visible = useMemo(() => (buildingId ? units.filter((u) => u.buildingId === buildingId) : units), [units, buildingId]);

  const counts = useMemo(() => {
    const c: Record<PmUnitStatus, number> = { REQUESTED: 0, IN_PROGRESS: 0, SCHEDULED: 0, ON_HOLD: 0, DONE: 0, DECLINED: 0 };
    for (const u of visible) c[u.status]++;
    return c;
  }, [visible]);

  async function signOut() {
    await fetch(`/api/pm/${token}/sign-out`, { method: "POST" }).catch(() => null);
    router.refresh();
  }

  const unitLabel = (u: PmUnit) => (showBuilding ? `${buildingName.get(u.buildingId) ?? ""} #${u.unitNumber}` : `#${u.unitNumber}`);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-pink-600">Sueep</p>
            <h1 className="text-lg font-semibold">Hi {firstName}</h1>
          </div>
          <div className="flex items-center gap-4">
            <button type="button" onClick={signOut} className="text-xs text-gray-500 hover:text-pink-600">
              Sign out on this device
            </button>
            {buildings.length > 0 && (
              <button
                type="button"
                onClick={() => setRequestDate("")}
                className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500"
              >
                Book a turnover
              </button>
            )}
          </div>
        </div>
      </header>

      {(sueepContact.name || sueepContact.phone) && (
        <div className="border-b border-pink-100 bg-pink-50">
          <p className="mx-auto max-w-5xl px-4 py-2 text-sm text-gray-700">
            Questions? {sueepContact.phone ? "Call" : "Contact"} {sueepContact.name ?? "us"}
            {sueepContact.phone && (
              <>
                {" "}at{" "}
                <a href={`tel:${sueepContact.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-pink-700 underline">
                  {sueepContact.phone}
                </a>
              </>
            )}
            .
          </p>
        </div>
      )}

      <div className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        {notice && (
          <div className="flex items-start justify-between gap-3 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")} aria-label="Dismiss" className="text-emerald-700">
              ×
            </button>
          </div>
        )}
        {buildings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No buildings are set up for you yet. Contact Sueep at{" "}
            <a href={`mailto:${contactEmail}`} className="text-pink-600 hover:underline">
              {contactEmail}
            </a>
            .
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {buildings.length > 1 ? (
                <SearchableSelect
                  value={buildingId}
                  onChange={setBuildingId}
                  options={buildings.map((b) => ({ value: b.id, label: b.name }))}
                  placeholder="All buildings"
                  allLabel="All buildings"
                  className="w-full sm:w-72"
                />
              ) : (
                <div>
                  <p className="font-medium">{buildings[0].name}</p>
                  <p className="text-xs text-gray-500">{buildings[0].address}</p>
                </div>
              )}
              <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 text-sm">
                {VIEWS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => setView(v.value)}
                    className={`rounded px-3 py-1.5 ${view === v.value ? "bg-pink-600 text-white" : "text-gray-600 hover:text-gray-900"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {STATUS_ORDER.filter((s) => s !== "DONE" && s !== "DECLINED" && (s !== "REQUESTED" || counts.REQUESTED > 0)).map((s) => (
                <span key={s} className={`rounded-full px-2.5 py-1 font-medium ${STATUS[s].chip}`}>
                  {counts[s]} {STATUS[s].label.toLowerCase()}
                </span>
              ))}
            </div>

            {view === "upcoming" ? (
              <ComingUpView
                units={visible}
                today={today}
                unitLabel={unitLabel}
                onOpen={setOpenUnit}
                onBook={() => setRequestDate("")}
                onSeeAll={() => setView("list")}
              />
            ) : view === "month" ? (
              <MonthView
                units={visible}
                month={month}
                setMonth={setMonth}
                today={today}
                selectedDay={selectedDay}
                setSelectedDay={setSelectedDay}
                unitLabel={unitLabel}
                onOpen={setOpenUnit}
                onRequest={setRequestDate}
              />
            ) : (
              <ListView units={visible} unitLabel={unitLabel} onOpen={setOpenUnit} doneShown={doneShown} showMoreDone={() => setDoneShown((n) => n + DONE_LIST_STEP)} />
            )}
          </>
        )}

        <p className="pt-4 text-center text-xs text-gray-400">
          Questions? Email{" "}
          <a href={`mailto:${sueepContact.email ?? contactEmail}`} className="hover:text-pink-600 hover:underline">
            {sueepContact.email ?? contactEmail}
          </a>
          .
        </p>
      </div>

      {openUnit && (
        <UnitPanel
          unit={openUnit}
          buildingName={buildingName.get(openUnit.buildingId) ?? ""}
          token={token}
          today={today}
          contactEmail={contactEmail}
          onClose={() => setOpenUnit(null)}
          onDone={(msg) => {
            setOpenUnit(null);
            setNotice(msg);
            router.refresh();
          }}
        />
      )}

      {requestDate !== null && (
        <BookingForm
          token={token}
          buildings={buildings}
          defaultBuildingId={buildingId || (buildings.length === 1 ? buildings[0].id : "")}
          defaultDate={requestDate}
          today={today}
          units={units}
          knownUnits={knownUnits}
          onClose={() => setRequestDate(null)}
          onSent={(msg) => {
            setRequestDate(null);
            setNotice(msg);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      {STATUS_ORDER.filter((s) => s !== "DECLINED").map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${STATUS[s].dot}`} />
          {STATUS[s].label}
        </span>
      ))}
    </div>
  );
}

function UnitRow({ unit, label, onOpen }: { unit: PmUnit; label: string; onOpen: (u: PmUnit) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(unit)}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{label}</p>
        <p className="text-xs text-gray-500">
          {dateRange(unit)}
          {unit.pendingChange && (
            <span className="text-amber-700">
              {" "}
              · {unit.pendingChange.kind === "CANCEL" ? "Cancel requested" : `New date requested: ${formatKey(unit.pendingChange.newStart)}`}
            </span>
          )}
        </p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[unit.status].chip}`}>{STATUS[unit.status].label}</span>
    </button>
  );
}

function MonthView({
  units,
  month,
  setMonth,
  today,
  selectedDay,
  setSelectedDay,
  unitLabel,
  onOpen,
  onRequest,
}: {
  units: PmUnit[];
  month: string;
  setMonth: (m: string) => void;
  today: string;
  selectedDay: string | null;
  setSelectedDay: (d: string | null) => void;
  unitLabel: (u: PmUnit) => string;
  onOpen: (u: PmUnit) => void;
  onRequest: (date: string) => void;
}) {
  const first = keyToDate(`${month}-01`);
  const days = useMemo(() => {
    const start = new Date(first);
    start.setUTCDate(1 - first.getUTCDay());
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const end = new Date(last);
    end.setUTCDate(last.getUTCDate() + (6 - last.getUTCDay()));
    const out: string[] = [];
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) out.push(dateToKey(d));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function shift(n: number) {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1));
    setMonth(dateToKey(d).slice(0, 7));
    setSelectedDay(null);
  }

  const onDay = (key: string) => units.filter((u) => u.status !== "DECLINED" && coversDay(u, key));
  const selectedUnits = selectedDay ? onDay(selectedDay) : [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded px-2 py-1 text-gray-600 hover:bg-gray-200">
            ‹
          </button>
          <h2 className="min-w-[9rem] text-center font-semibold">{formatKey(`${month}-01`, { month: "long", year: "numeric" })}</h2>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded px-2 py-1 text-gray-600 hover:bg-gray-200">
            ›
          </button>
        </div>
        {month !== today.slice(0, 7) && (
          <button type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDay(null); }} className="text-xs text-pink-600 hover:underline">
            Today
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-[11px] font-medium uppercase text-gray-500">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((key) => {
            const inMonth = key.startsWith(month);
            const dayUnits = onDay(key);
            const selected = key === selectedDay;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(selected ? null : key)}
                className={`min-h-[3.5rem] border-b border-r border-gray-100 p-1 text-left align-top sm:min-h-[6rem] ${
                  inMonth ? "bg-white" : "bg-gray-50 text-gray-400"
                } ${selected ? "ring-2 ring-inset ring-pink-500" : "hover:bg-pink-50/40"}`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    key === today ? "bg-pink-600 font-semibold text-white" : ""
                  }`}
                >
                  {Number(key.slice(8))}
                </span>
                {/* Phones: colored dots. Bigger screens: unit chips. */}
                <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                  {dayUnits.slice(0, 6).map((u) => (
                    <span key={u.id} className={`h-1.5 w-1.5 rounded-full ${STATUS[u.status].dot}`} />
                  ))}
                </div>
                <div className="mt-0.5 hidden space-y-0.5 sm:block">
                  {dayUnits.slice(0, MAX_CHIPS).map((u) => (
                    <span key={u.id} className={`block truncate rounded px-1 py-0.5 text-[11px] font-medium ${STATUS[u.status].chip}`}>
                      {unitLabel(u)}
                    </span>
                  ))}
                  {dayUnits.length > MAX_CHIPS && <span className="block px-1 text-[11px] text-gray-500">+{dayUnits.length - MAX_CHIPS} more</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Legend />

      {selectedDay && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2">
            <p className="text-sm font-semibold">{formatKey(selectedDay, { weekday: "long", month: "long", day: "numeric" })}</p>
            {selectedDay >= today && (
              <button type="button" onClick={() => onRequest(selectedDay)} className="text-xs font-medium text-pink-600 hover:underline">
                + Book this day
              </button>
            )}
          </div>
          {selectedUnits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">No turnovers this day.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {selectedUnits.map((u) => (
                <UnitRow key={u.id} unit={u} label={unitLabel(u)} onOpen={onOpen} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ListView({
  units,
  unitLabel,
  onOpen,
  doneShown,
  showMoreDone,
}: {
  units: PmUnit[];
  unitLabel: (u: PmUnit) => string;
  onOpen: (u: PmUnit) => void;
  doneShown: number;
  showMoreDone: () => void;
}) {
  if (units.length === 0) {
    return <p className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">No turnovers yet.</p>;
  }
  return (
    <div className="space-y-4">
      {STATUS_ORDER.map((status) => {
        let group = units.filter((u) => u.status === status);
        if (!group.length) return null;
        // Most recent finished units first; everything else soonest first.
        if (status === "DONE") group = [...group].sort((a, b) => (b.end ?? b.start ?? "").localeCompare(a.end ?? a.start ?? ""));
        const shown = status === "DONE" ? group.slice(0, doneShown) : group;
        return (
          <section key={status} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 text-sm font-semibold">
              <span className={`h-2.5 w-2.5 rounded-full ${STATUS[status].dot}`} />
              {STATUS[status].label} <span className="font-normal text-gray-400">{group.length}</span>
            </h2>
            <div className="divide-y divide-gray-100">
              {shown.map((u) => (
                <UnitRow key={u.id} unit={u} label={unitLabel(u)} onOpen={onOpen} />
              ))}
            </div>
            {shown.length < group.length && (
              <button type="button" onClick={showMoreDone} className="w-full border-t border-gray-100 py-2 text-xs text-pink-600 hover:bg-gray-50">
                Show more
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function UnitPanel({
  unit,
  buildingName,
  token,
  today,
  contactEmail,
  onClose,
  onDone,
}: {
  unit: PmUnit;
  buildingName: string;
  token: string;
  today: string;
  contactEmail: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const doneCount = unit.scope.filter((s) => s.done).length;
  const isRequest = unit.kind === "request";
  const row = (label: string, value: string | null) =>
    value ? (
      <div className="flex justify-between gap-4 py-1.5 text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="text-right font-medium">{value}</span>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Unit ${unit.unitNumber}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">{buildingName}</p>
            <h2 className="text-lg font-semibold">Unit {unit.unitNumber}</h2>
            {unit.layout && <p className="text-sm text-gray-500">{unit.layout}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded px-2 text-xl leading-none text-gray-400 hover:text-gray-700">
            ×
          </button>
        </div>

        <span className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[unit.status].chip}`}>{STATUS[unit.status].label}</span>
        {isRequest && unit.status === "REQUESTED" && <p className="mt-2 text-sm text-gray-600">Waiting for Sueep to confirm the date and price.</p>}
        {unit.status === "DECLINED" && (
          <p className="mt-2 text-sm text-red-700">Sueep can&apos;t take this one{unit.declineReason ? `: ${unit.declineReason}` : "."}</p>
        )}

        <div className="mt-3 divide-y divide-gray-100 border-y border-gray-100">
          {row(isRequest ? "Preferred start" : "Dates", dateRange(unit))}
          {row("Move-out", formatKey(unit.moveOut, { month: "short", day: "numeric", year: "numeric" }) || null)}
          {row("Move-in", formatKey(unit.moveIn, { month: "short", day: "numeric", year: "numeric" }) || null)}
          {unit.crewDays.length > 0 && unit.status !== "DONE" && row("Crew on site", unit.crewDays.map((d) => formatKey(d)).join(", "))}
          {isRequest
            ? row("Estimate", `${money(unit.priceCents ?? 0)}${unit.hasUnpricedWork ? " plus other work" : ""}`)
            : row("Price", unit.priceCents != null && unit.priceCents > 0 ? money(unit.priceCents) : "Not set yet")}
        </div>
        {unit.notes && <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{unit.notes}</p>}

        {unit.scope.length > 0 && (
          <div className="mt-4">
            <p className="flex items-center justify-between text-sm font-semibold">
              Work
              {unit.status !== "DONE" && !isRequest && (
                <span className="text-xs font-normal text-gray-500">
                  {doneCount} of {unit.scope.length} done
                </span>
              )}
            </p>
            <ul className="mt-2 space-y-1.5">
              {unit.scope.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      s.done ? "bg-emerald-500 text-white" : "border border-gray-300"
                    }`}
                  >
                    {s.done ? "✓" : ""}
                  </span>
                  <span className={s.done ? "text-gray-500" : ""}>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ChangeSection unit={unit} token={token} today={today} contactEmail={contactEmail} onDone={onDone} />
      </div>
    </div>
  );
}

/** Cancel or move: right away for a request Sueep hasn't confirmed, or as an ask to staff for a confirmed turnover. */
function ChangeSection({
  unit,
  token,
  today,
  contactEmail,
  onDone,
}: {
  unit: PmUnit;
  token: string;
  today: string;
  contactEmail: string;
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<"move" | "cancel" | null>(null);
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(path: string, method: "POST" | "PATCH", body: unknown, message: string) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/pm/${token}/${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      onDone(message);
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  const unitName = `Unit ${unit.unitNumber}`;
  const isPending = unit.kind === "request" && unit.status === "REQUESTED";
  const isScheduledUnit = unit.kind === "unit" && unit.status === "SCHEDULED" && unit.start;
  if (!isPending && !isScheduledUnit) return null;

  const box = (children: React.ReactNode) => <div className="mt-5 space-y-2 border-t border-gray-100 pt-4">{children}</div>;
  const errorLine = error && <p className="text-sm text-red-600">{error}</p>;

  if (unit.pendingChange) {
    const c = unit.pendingChange;
    return box(
      <>
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {c.kind === "CANCEL" ? "You asked to cancel this." : `You asked to move this to ${formatKey(c.newStart, { weekday: "short", month: "short", day: "numeric" })}.`} Waiting for Sueep.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => call(`changes/${c.id}/withdraw`, "POST", {}, `${unitName}: your change was taken back. Nothing changes.`)}
          className="text-xs text-gray-500 hover:text-pink-600 disabled:opacity-50"
        >
          Take it back
        </button>
        {errorLine}
      </>,
    );
  }

  const deadline = isScheduledUnit ? changeDeadline(unit.start!) : null;
  if (deadline && new Date() > deadline) {
    return box(
      <p className="text-sm text-gray-600">
        It&apos;s too close to the start to change this here. Email{" "}
        <a href={`mailto:${contactEmail}`} className="text-pink-600 hover:underline">
          {contactEmail}
        </a>
        .
      </p>,
    );
  }

  const linkBtn = "text-sm font-medium text-pink-600 hover:underline";
  return box(
    <>
      {mode === null && (
        <>
          <div className="flex flex-wrap gap-4">
            <button type="button" onClick={() => setMode("move")} className={linkBtn}>
              {isPending ? "Change date" : "Ask for a new date"}
            </button>
            <button type="button" onClick={() => setMode("cancel")} className="text-sm font-medium text-gray-500 hover:text-red-600">
              {isPending ? "Cancel request" : "Cancel turnover"}
            </button>
          </div>
          {deadline && <p className="text-xs text-gray-500">You can change this until {changeDeadlineLabel(deadline)}. Sueep confirms changes.</p>}
        </>
      )}

      {mode === "move" && (
        <div className="space-y-2">
          <label className={labelCls} htmlFor="chg-date">
            New start date
          </label>
          <input id="chg-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          {!isPending && (
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (optional)" aria-label="Reason" className={fieldClass} />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !date}
              onClick={() =>
                isPending
                  ? call(`requests/${unit.id}`, "PATCH", { requestedStartDate: date }, `${unitName}: date changed. Still waiting for Sueep to confirm.`)
                  : call(`units/${unit.id}/changes`, "POST", { kind: "RESCHEDULE", newStartDate: date, reason }, `${unitName}: new date sent. Sueep will confirm it.`)
              }
              className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {busy ? "Sending…" : isPending ? "Save date" : "Send to Sueep"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
              Back
            </button>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            {isPending ? "Cancel this request? Sueep hasn't scheduled it yet." : "Ask Sueep to cancel this turnover? It stays on until Sueep confirms."}
          </p>
          {!isPending && (
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (optional)" aria-label="Reason" className={fieldClass} />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                isPending
                  ? call(`requests/${unit.id}/cancel`, "POST", {}, `${unitName}: request cancelled.`)
                  : call(`units/${unit.id}/changes`, "POST", { kind: "CANCEL", reason }, `${unitName}: cancel sent. Sueep will confirm it.`)
              }
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Sending…" : isPending ? "Yes, cancel it" : "Send to Sueep"}
            </button>
            <button type="button" onClick={() => setMode(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
              Back
            </button>
          </div>
        </div>
      )}
      {errorLine}
    </>,
  );
}

const fieldClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";


/** The default view: what needs their attention and what's next, as a plain list. */
function ComingUpView({
  units,
  today,
  unitLabel,
  onOpen,
  onBook,
  onSeeAll,
}: {
  units: PmUnit[];
  today: string;
  unitLabel: (u: PmUnit) => string;
  onOpen: (u: PmUnit) => void;
  onBook: () => void;
  onSeeAll: () => void;
}) {
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + COMING_UP_DAYS);
  const horizonKey = dateToKey(horizon);
  const byStart = (a: PmUnit, b: PmUnit) => (a.start ?? "").localeCompare(b.start ?? "");

  const waiting = units.filter((u) => u.status === "REQUESTED" || u.pendingChange).sort(byStart);
  const now = units.filter((u) => u.status === "IN_PROGRESS" && !u.pendingChange).sort(byStart);
  const soon = units.filter((u) => u.status === "SCHEDULED" && !u.pendingChange && (u.start ?? "") <= horizonKey).sort(byStart);
  const onHold = units.filter((u) => u.status === "ON_HOLD");
  const later = units.filter((u) => u.status === "SCHEDULED" && !u.pendingChange && (u.start ?? "") > horizonKey).length;

  if (!waiting.length && !now.length && !soon.length && !onHold.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="font-medium">Nothing coming up</p>
        <p className="mt-1 text-sm text-gray-500">
          {later ? `You have ${later} turnover${later === 1 ? "" : "s"} booked further out.` : "Need a unit turned? Book it here."}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button type="button" onClick={onBook} className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500">
            Book a turnover
          </button>
          {later > 0 && (
            <button type="button" onClick={onSeeAll} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700">
              See all
            </button>
          )}
        </div>
      </div>
    );
  }

  const section = (title: string, list: PmUnit[], hint?: string) =>
    list.length > 0 && (
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-2">
          <h2 className="text-sm font-semibold">
            {title} <span className="font-normal text-gray-400">{list.length}</span>
          </h2>
          {hint && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
        <div className="divide-y divide-gray-100">
          {list.map((u) => (
            <UnitRow key={u.id} unit={u} label={unitLabel(u)} onOpen={onOpen} />
          ))}
        </div>
      </section>
    );

  return (
    <div className="space-y-4">
      {section("Waiting for Sueep", waiting, "We'll email you when we confirm.")}
      {section("Being worked on now", now)}
      {section(`Booked, next ${COMING_UP_DAYS} days`, soon)}
      {section("On hold", onHold)}
      {later > 0 && (
        <button type="button" onClick={onSeeAll} className="w-full rounded-lg border border-gray-200 bg-white py-3 text-sm text-pink-600 hover:bg-gray-50">
          {later} more booked after that. See all
        </button>
      )}
    </div>
  );
}

type UnitDraft = {
  key: number;
  unitNumber: string;
  layout: RequestLayoutValue | "";
  /** True once they pick or change the size, so a known unit's size doesn't overwrite it */
  layoutPicked: boolean;
  work: RequestWork;
  otherWork: boolean;
  otherDescription: string;
  moveOut: string;
  moveIn: string;
  showMore: boolean;
  /** This unit's own start day; empty means it uses the booking's start date */
  ownStart: string;
};

const NO_WORK: RequestWork = { fullClean: false, fullPaint: false, touchUpPaint: false, carpetCleaning: false };

function newDraft(key: number, copyWorkFrom?: UnitDraft): UnitDraft {
  return {
    key,
    unitNumber: "",
    layout: "",
    layoutPicked: false,
    work: copyWorkFrom ? { ...copyWorkFrom.work } : { ...NO_WORK },
    otherWork: copyWorkFrom?.otherWork ?? false,
    otherDescription: copyWorkFrom?.otherDescription ?? "",
    moveOut: "",
    moveIn: "",
    showMore: false,
    ownStart: "",
  };
}

const sameWork = (a: RequestWork, b: RequestWork) =>
  a.fullClean === b.fullClean && a.fullPaint === b.fullPaint && a.touchUpPaint === b.touchUpPaint && a.carpetCleaning === b.carpetCleaning;
const hasWork = (w: RequestWork) => w.fullClean || w.fullPaint || w.touchUpPaint || w.carpetCleaning;

/** Book one or more units at one building. Only unit, work, and date are needed; everything else is optional. */
function BookingForm({
  token,
  buildings,
  defaultBuildingId,
  defaultDate,
  today,
  units,
  knownUnits,
  onClose,
  onSent,
}: {
  token: string;
  buildings: PmBuilding[];
  defaultBuildingId: string;
  defaultDate: string;
  today: string;
  units: PmUnit[];
  knownUnits: Record<string, KnownUnit>;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [buildingId, setBuildingId] = useState(defaultBuildingId);
  const [start, setStart] = useState(defaultDate);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [drafts, setDrafts] = useState<UnitDraft[]>([newDraft(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const building = buildings.find((b) => b.id === buildingId) ?? null;

  function update(key: number, changes: Partial<UnitDraft>) {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...changes } : d)));
  }
  function addUnit() {
    setDrafts((list) => [...list, newDraft(nextKey, list[list.length - 1])]);
    setNextKey((k) => k + 1);
  }
  function removeUnit(key: number) {
    const left = drafts.filter((d) => d.key !== key);
    // Down to one unit: its own date becomes the booking's, since the per-unit date only shows with 2+.
    if (left.length === 1 && left[0].ownStart) {
      setStart(left[0].ownStart);
      left[0] = { ...left[0], ownStart: "" };
    }
    setDrafts(left);
  }

  /** Size and last work for a draft, from the unit's last turnover when we know it. */
  function resolved(d: UnitDraft) {
    const known = building && d.unitNumber.trim() ? knownUnits[unitKey(building.id, d.unitNumber)] : undefined;
    const layout = d.layoutPicked ? d.layout : (known?.layout ?? d.layout);
    const layoutDef = REQUEST_LAYOUTS.find((l) => l.value === layout);
    const estimate = building && layoutDef ? estimateRequestCents(building.pricingPackage, layoutDef.bedrooms, layoutDef.bathrooms, d.work) : null;
    return { known, layout, layoutDef, estimate };
  }

  const rows = drafts.map((d) => ({ d, ...resolved(d) }));
  const ready =
    !!building &&
    !!start &&
    rows.every((r) => r.d.unitNumber.trim() && r.layoutDef && (hasWork(r.d.work) || (r.d.otherWork && r.d.otherDescription.trim())));
  const total = rows.reduce((n, r) => n + (r.estimate ?? 0), 0);
  const anyOther = rows.some((r) => r.d.otherWork);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/pm/${token}/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buildingId,
          requestedStartDate: start,
          notes,
          units: rows.map(({ d, layout }) => ({
            unitNumber: d.unitNumber,
            layout,
            ...d.work,
            otherWork: d.otherWork,
            otherDescription: d.otherDescription,
            startDate: d.ownStart || undefined,
            moveOutDate: d.moveOut,
            moveInDate: d.moveIn,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't send. Try again.");
        return;
      }
      onSent(
        drafts.length === 1
          ? `Unit ${drafts[0].unitNumber.trim().replace(/^#/, "")} sent. We'll email you to confirm the date and price.`
          : `${drafts.length} units sent. We'll email you to confirm the dates and prices.`,
      );
    } catch {
      setError("Couldn't connect. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center">
      <form
        onSubmit={submit}
        role="dialog"
        aria-label="Book a turnover"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Book a turnover</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded px-2 text-xl leading-none text-gray-400 hover:text-gray-700">
            ×
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {buildings.length > 1 && (
            <div>
              <label className={labelCls} htmlFor="req-building">
                Building
              </label>
              <SearchableSelect
                id="req-building"
                value={buildingId}
                onChange={setBuildingId}
                options={buildings.map((b) => ({ value: b.id, label: b.name }))}
                placeholder="Pick a building"
                allLabel="Pick a building"
                className="mt-1"
              />
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="req-start">
              {drafts.length > 1 ? "Start date for all units" : "Start date"}
            </label>
            <input id="req-start" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} className={fieldClass} />
          </div>

          {rows.map(({ d, known, layout, estimate }, i) => {
            const key = building && d.unitNumber.trim() ? unitKey(building.id, d.unitNumber) : null;
            const openForUnit = key
              ? units.find((u) => u.status !== "DONE" && u.status !== "DECLINED" && unitKey(u.buildingId, u.unitNumber) === key)
              : undefined;
            const knownSize = !d.layoutPicked && known?.layout ? REQUEST_LAYOUTS.find((l) => l.value === known.layout) : undefined;
            const canRepeat = known && hasWork(known.work) && !sameWork(known.work, d.work);
            const unitStart = d.ownStart || start;
            return (
              <div key={d.key} className="space-y-3 rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{drafts.length > 1 ? `Unit ${i + 1}` : "Unit"}</p>
                  {drafts.length > 1 && (
                    <button type="button" onClick={() => removeUnit(d.key)} className="text-xs text-gray-500 hover:text-red-600">
                      Remove
                    </button>
                  )}
                </div>

                <div>
                  <label className={labelCls} htmlFor={`req-unit-${d.key}`}>
                    Unit number
                  </label>
                  <input
                    id={`req-unit-${d.key}`}
                    value={d.unitNumber}
                    onChange={(e) => update(d.key, { unitNumber: e.target.value })}
                    placeholder="e.g. 204"
                    className={fieldClass}
                  />
                  {openForUnit && (
                    <p className="mt-1 text-xs text-amber-700">
                      This unit already has a turnover {STATUS[openForUnit.status].label.toLowerCase()} ({dateRange(openForUnit)}).
                    </p>
                  )}
                </div>

                {drafts.length > 1 &&
                  (d.ownStart ? (
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <label className={labelCls} htmlFor={`req-start-${d.key}`}>
                          Start date for this unit
                        </label>
                        <button type="button" onClick={() => update(d.key, { ownStart: "" })} className="text-xs text-gray-500 hover:text-pink-600">
                          Same as the others
                        </button>
                      </div>
                      <input
                        id={`req-start-${d.key}`}
                        type="date"
                        min={today}
                        value={d.ownStart}
                        onChange={(e) => update(d.key, { ownStart: e.target.value })}
                        className={fieldClass}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700">
                      Starts {start ? formatKey(start, { weekday: "short", month: "short", day: "numeric" }) : "on the date above"}{" "}
                      <button type="button" onClick={() => update(d.key, { ownStart: start || today })} className="text-xs text-pink-600 hover:underline">
                        Change date
                      </button>
                    </p>
                  ))}

                {knownSize ? (
                  <p className="text-sm text-gray-700">
                    {knownSize.label} <span className="text-gray-500">(from last time)</span>{" "}
                    <button type="button" onClick={() => update(d.key, { layout: knownSize.value, layoutPicked: true })} className="text-xs text-pink-600 hover:underline">
                      Change
                    </button>
                  </p>
                ) : (
                  <div>
                    <p className={labelCls}>Size</p>
                    <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {REQUEST_LAYOUTS.map((l) => (
                        <button
                          key={l.value}
                          type="button"
                          onClick={() => update(d.key, { layout: l.value, layoutPicked: true })}
                          className={`rounded-md border px-2 py-2 text-xs ${
                            layout === l.value ? "border-pink-500 bg-pink-50 font-medium text-pink-700" : "border-gray-300 text-gray-700 hover:border-pink-300"
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <fieldset>
                  <legend className={labelCls}>Work needed</legend>
                  {canRepeat && (
                    <button
                      type="button"
                      onClick={() => update(d.key, { work: { ...known!.work } })}
                      className="mt-1 rounded-full border border-pink-300 px-3 py-1 text-xs font-medium text-pink-700 hover:bg-pink-50"
                    >
                      Same as last time
                    </button>
                  )}
                  <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                    {REQUEST_WORK.map((w) => {
                      const coveredByPaint = w.key === "touchUpPaint" && d.work.fullPaint;
                      return (
                        <label key={w.key} className={`flex items-center gap-2 py-0.5 text-sm ${coveredByPaint ? "text-gray-400" : "text-gray-700"}`}>
                          <input
                            type="checkbox"
                            checked={d.work[w.key] && !coveredByPaint}
                            disabled={coveredByPaint}
                            onChange={() => update(d.key, { work: { ...d.work, [w.key]: !d.work[w.key] } })}
                            className="h-5 w-5 text-pink-600"
                          />
                          {w.label}
                          {coveredByPaint && <span className="text-xs">(in full paint)</span>}
                        </label>
                      );
                    })}
                    <label className="flex items-center gap-2 py-0.5 text-sm text-gray-700">
                      <input type="checkbox" checked={d.otherWork} onChange={() => update(d.key, { otherWork: !d.otherWork })} className="h-5 w-5 text-pink-600" />
                      Other
                    </label>
                  </div>
                  {d.otherWork && (
                    <input
                      value={d.otherDescription}
                      onChange={(e) => update(d.key, { otherDescription: e.target.value })}
                      placeholder="What else needs doing?"
                      aria-label="Other work"
                      className={fieldClass}
                    />
                  )}
                </fieldset>

                {d.showMore ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor={`req-out-${d.key}`}>
                        Move-out
                      </label>
                      <input id={`req-out-${d.key}`} type="date" value={d.moveOut} onChange={(e) => update(d.key, { moveOut: e.target.value })} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`req-in-${d.key}`}>
                        Move-in
                      </label>
                      <input id={`req-in-${d.key}`} type="date" min={unitStart || today} value={d.moveIn} onChange={(e) => update(d.key, { moveIn: e.target.value })} className={fieldClass} />
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => update(d.key, { showMore: true })} className="text-xs text-gray-500 hover:text-pink-600">
                    + Move-out and move-in dates
                  </button>
                )}

                {drafts.length > 1 && estimate != null && hasWork(d.work) && (
                  <p className="text-right text-xs text-gray-500">
                    Estimate {money(estimate)}
                    {d.otherWork ? " + other" : ""}
                  </p>
                )}
              </div>
            );
          })}

          {drafts.length < MAX_UNITS_PER_BOOKING && (
            <button type="button" onClick={addUnit} className="w-full rounded-lg border border-dashed border-gray-300 py-2.5 text-sm text-pink-600 hover:bg-pink-50">
              + Add another unit
            </button>
          )}

          {showNotes ? (
            <div>
              <label className={labelCls} htmlFor="req-notes">
                Note for Sueep
              </label>
              <textarea
                id="req-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Access, lockbox code, anything we should know"
                className={fieldClass}
              />
            </div>
          ) : (
            <button type="button" onClick={() => setShowNotes(true)} className="text-xs text-gray-500 hover:text-pink-600">
              + Add a note for Sueep
            </button>
          )}

          <div className="rounded-md bg-pink-50 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-pink-700">{drafts.length > 1 ? "Total estimate" : "Estimate"}</span>
              <span className="text-xl font-bold text-pink-700">
                {rows.some((r) => r.estimate != null && hasWork(r.d.work)) ? money(total) : "--"}
                {anyOther && <span className="text-sm font-medium"> + other</span>}
              </span>
            </div>
            <p className="mt-1 text-xs text-pink-700/80">
              {!building ? "Pick the building to see an estimate." : `Sueep confirms the final price${anyOther ? " and prices the other work" : ""}.`}
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !ready}
            className="rounded-md bg-pink-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {busy ? "Sending…" : drafts.length > 1 ? `Send ${drafts.length} units` : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
