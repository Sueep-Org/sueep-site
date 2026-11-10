"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { isRealDay, type CompanyHoliday } from "@/lib/erp/holidays";

type Row = CompanyHoliday & { checkDate?: boolean };

/** The small input style without its full width, for the fixed-width date boxes. */
const dateInput = inputClass.sm.replace("w-full ", "");
type Clash = { date: string; name: string; jobs: string[]; changeOrders: number; janitorialShifts: number };

function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Company holidays (Admin only). Grouped by year; holidays before today are
 * locked. Saving warns about work already scheduled on a new holiday but
 * never moves it.
 */
export function HolidaysEditor({ holidays, saved, today, changedBy, changedAt }: { holidays: CompanyHoliday[]; saved: boolean; today: string; changedBy: string | null; changedAt: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>(holidays);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [clashes, setClashes] = useState<Clash[]>([]);

  const clean = (list: Row[]) => JSON.stringify(list.map(({ date, name }) => ({ date, name: name.trim() })).sort((a, b) => a.date.localeCompare(b.date)));
  const dirty = clean(rows) !== clean(holidays);
  const years = useMemo(() => {
    const thisYear = Number(today.slice(0, 4));
    const ys = new Set(rows.map((r) => Number(r.date.slice(0, 4))));
    ys.add(thisYear);
    return [...ys].sort((a, b) => b - a);
  }, [rows, today]);
  // Copy from the latest year that's filled in (3+ holidays), so a lone
  // New Year's Day in the next year doesn't become the source.
  const countIn = (y: number) => rows.filter((r) => r.date.startsWith(`${y}-`)).length;
  const filledYears = years.filter((y) => countIn(y) >= 3);
  const lastYearWithHolidays = filledYears.length ? Math.max(...filledYears) : Number(today.slice(0, 4));
  const nextYear = lastYearWithHolidays + 1;

  function add() {
    setError("");
    if (!isRealDay(newDate)) return setError("Pick a date");
    if (!newName.trim()) return setError("Give the holiday a name");
    if (newDate < today) return setError("Holidays before today can't be added");
    if (rows.some((r) => r.date === newDate)) return setError(`${dayLabel(newDate)} is already ${rows.find((r) => r.date === newDate)!.name}`);
    setRows((list) => [...list, { date: newDate, name: newName.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate("");
    setNewName("");
  }

  /** Same month and day next year. Holidays on "the 4th Thursday" etc. move, so each copy is flagged to check. */
  function copyYear() {
    const from = lastYearWithHolidays;
    const copies: Row[] = rows
      .filter((r) => r.date.startsWith(`${from}-`))
      .map((r) => ({ date: `${from + 1}${r.date.slice(4)}`, name: r.name, checkDate: true }))
      .filter((r) => isRealDay(r.date) && !rows.some((x) => x.date === r.date));
    if (copies.length === 0) return setError(`Nothing to copy from ${from}`);
    setError("");
    setRows((list) => [...list, ...copies].sort((a, b) => a.date.localeCompare(b.date)));
  }

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError("");
    const bad = rows.find((r) => !r.name.trim() || !isRealDay(r.date));
    if (method === "PUT" && bad) {
      setBusy(false);
      return setError(`Every holiday needs a date and a name (${bad.date || "no date"})`);
    }
    const dupe = rows.find((r, i) => rows.findIndex((x) => x.date === r.date) !== i);
    if (method === "PUT" && dupe) {
      setBusy(false);
      return setError(`Two holidays on ${dayLabel(dupe.date)}`);
    }
    const res = await fetch("/api/erp/settings/holidays", {
      method,
      headers: { "content-type": "application/json" },
      body: method === "PUT" ? JSON.stringify({ holidays: rows.map(({ date, name }) => ({ date, name: name.trim() })) }) : undefined,
    }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => null)) as { error?: string; holidays?: CompanyHoliday[]; clashes?: Clash[] } | null;
    if (!res?.ok) return setError(data?.error ?? "Could not save. Try again.");
    if (data?.holidays) setRows(data.holidays);
    setClashes(data?.clashes ?? []);
    toast(method === "PUT" ? "Holidays saved" : "Holidays back to the built-in list");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
            Company holidays
            <InfoTip
              wide
              text={"Days nobody works. The calendars mark them, and scheduling work on one asks first.\nHolidays before today are locked.\nAdding a holiday doesn't move work already scheduled on it: you'll see what's there after saving.\nAdmins only."}
            />
          </div>
          <p className="text-xs text-gray-400">
            {saved && changedBy ? `Last changed by ${changedBy.split("@")[0]}${changedAt ? ` on ${new Date(changedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}` : "Built-in list"}
          </p>
        </div>

        {years.map((year) => {
          const inYear = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.date.startsWith(`${year}-`));
          return (
            <div key={year} className="border-b border-gray-100 px-5 py-3 last:border-b-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {year} <span className="font-normal normal-case text-gray-400">· {plural(inYear.length, "holiday")}</span>
              </h3>
              {inYear.length === 0 ? (
                <p className="mt-2 text-sm text-gray-400">No holidays yet.</p>
              ) : (
                <ul className="mt-2 max-w-2xl space-y-1.5">
                  {inYear.map(({ r, i }) => {
                    const past = r.date < today;
                    return (
                      <li key={`${r.date}-${i}`} className="flex items-center gap-2">
                        {past ? (
                          <span className="w-40 shrink-0 text-sm text-gray-400">{dayLabel(r.date)}</span>
                        ) : (
                          <input
                            type="date"
                            aria-label="Date"
                            value={r.date}
                            min={today}
                            disabled={busy}
                            onChange={(e) => setRows((list) => list.map((x, j) => (j === i ? { ...x, date: e.target.value, checkDate: false } : x)))}
                            className={`${dateInput} w-40 shrink-0 ${r.checkDate ? "border-amber-400 bg-amber-50" : ""}`}
                          />
                        )}
                        {past ? (
                          <span className="min-w-0 flex-1 text-sm text-gray-400" title="Holidays before today are locked">
                            {r.name} <span aria-hidden>🔒</span>
                          </span>
                        ) : (
                          <input
                            aria-label="Holiday name"
                            value={r.name}
                            maxLength={80}
                            disabled={busy}
                            onChange={(e) => setRows((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                            className={`${inputClass.sm} min-w-0 flex-1`}
                          />
                        )}
                        {r.checkDate ? <span className="text-[11px] font-medium text-amber-700">Check this date</span> : null}
                        {!past ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
                            className="text-xs text-gray-500 hover:text-red-600"
                          >
                            Remove
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 bg-gray-50 px-5 py-3">
          <label className="text-xs text-gray-500">
            Date
            <input type="date" value={newDate} min={today} onChange={(e) => setNewDate(e.target.value)} disabled={busy} className={`${dateInput} mt-0.5 block w-40`} />
          </label>
          <label className="min-w-[12rem] flex-1 text-xs text-gray-500">
            Name
            <input
              value={newName}
              maxLength={80}
              placeholder="Day after Thanksgiving"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              disabled={busy}
              className={`${inputClass.sm} mt-0.5 block`}
            />
          </label>
          <Button variant="secondary" size="sm" type="button" disabled={busy} onClick={add}>
            + Add holiday
          </Button>
          <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={copyYear} title={`Copies ${lastYearWithHolidays}'s holidays to the same days in ${nextYear}. Check each date: holidays like Thanksgiving move every year.`}>
            Copy {lastYearWithHolidays} to {nextYear}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {dirty ? (
          <>
            <Button size="sm" type="button" disabled={busy} onClick={() => send("PUT")}>
              {busy ? "Saving…" : "Save holidays"}
            </Button>
            <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => setRows(holidays)}>
              Cancel
            </Button>
            {rows.some((r) => r.checkDate) ? <span className="text-xs text-amber-700">Check the dates marked in amber before saving.</span> : null}
          </>
        ) : saved ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await confirm({ message: "Put company holidays back to the built-in list? Holidays you added are removed.", confirmLabel: "Reset" })) send("DELETE");
            }}
          >
            Reset to built-in list
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {clashes.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Work is already scheduled on a new holiday. Nothing was moved:</p>
          <ul className="mt-2 space-y-1">
            {clashes.map((c) => (
              <li key={c.date}>
                <span className="font-medium">
                  {dayLabel(c.date)} ({c.name}):
                </span>{" "}
                {[
                  c.jobs.length ? plural(c.jobs.length, "job") : null,
                  c.changeOrders ? plural(c.changeOrders, "change order day") : null,
                  c.janitorialShifts ? plural(c.janitorialShifts, "janitorial shift") : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                {c.jobs.length ? <span className="text-amber-800"> · {c.jobs.slice(0, 3).join(", ")}{c.jobs.length > 3 ? "…" : ""}</span> : null}
              </li>
            ))}
          </ul>
          <Link href="/erp/schedule" className="mt-2 inline-block font-medium text-amber-900 underline">
            Open the schedule
          </Link>
        </div>
      ) : null}
    </div>
  );
}
