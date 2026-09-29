"use client";

import { useEffect, useState } from "react";
import { centsToDollars } from "@/lib/erp/money";
import {
  ROLE_SUGGESTIONS,
  calculatePricing,
  newLine,
  type ContractPricing,
  type PricingLine,
} from "@/lib/erp/janitorialPricing";

/** Number input that lets people type freely ("24.", "") and reports numbers. */
function NumInput({
  value,
  onChange,
  step = "any",
  prefix,
  suffix,
  className = "w-20",
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: string;
  prefix?: string;
  suffix?: string;
  className?: string;
  ariaLabel: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // Only resync when the value changes from outside, not on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className="inline-flex items-center gap-1">
      {prefix && <span className="text-xs text-gray-400">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={text}
        aria-label={ariaLabel}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) && e.target.value !== "" ? n : 0);
        }}
        className={`${className} rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500`}
      />
      {suffix && <span className="text-xs text-gray-400">{suffix}</span>}
    </span>
  );
}

/** Dollar override input: blank means "use the calculated amount". */
function OverrideInput({ cents, onChange, ariaLabel }: { cents: number | null; onChange: (c: number | null) => void; ariaLabel: string }) {
  const [text, setText] = useState(cents == null ? "" : (cents / 100).toFixed(2));
  useEffect(() => {
    const current = text === "" ? null : Math.round(Number(text) * 100);
    if (current !== cents) setText(cents == null ? "" : (cents / 100).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      value={text}
      aria-label={ariaLabel}
      placeholder="Calculated"
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        onChange(e.target.value === "" || !Number.isFinite(n) ? null : Math.round(n * 100));
      }}
      className="w-28 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-right text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
    />
  );
}

export function PricingCalculator({ value, onChange }: { value: ContractPricing; onChange: (next: ContractPricing) => void }) {
  const result = calculatePricing(value);
  const [overridingLine, setOverridingLine] = useState<Set<string>>(() => new Set(value.lines.filter((l) => l.monthlyOverrideCents != null).map((l) => l.id)));
  const [overridingTotal, setOverridingTotal] = useState(value.totalOverrideCents != null);

  const setLine = (id: string, patch: Partial<PricingLine>) =>
    onChange({ ...value, lines: value.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLine = (id: string) => onChange({ ...value, lines: value.lines.filter((l) => l.id !== id) });

  const lineResult = new Map(result.lines.map((l) => [l.id, l]));
  const marginTone =
    result.marginPct == null ? "text-gray-900" : result.marginPct < 0 ? "text-red-600" : result.marginPct < 0.15 ? "text-amber-600" : "text-emerald-700";
  const firstPayRate = value.lines.find((l) => l.payRate > 0)?.payRate ?? 0;

  return (
    <div className="space-y-4">
      <datalist id="pricing-roles">
        {ROLE_SUGGESTIONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
            <tr>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">People</th>
              <th className="px-3 py-2">Hrs / week each</th>
              <th className="px-3 py-2">Bill rate</th>
              <th className="px-3 py-2">Pay rate</th>
              <th className="px-3 py-2 text-right">Monthly price</th>
              <th className="px-3 py-2 text-right">Yearly price</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {value.lines.map((l) => {
              const r = lineResult.get(l.id)!;
              const overriding = overridingLine.has(l.id);
              return (
                <tr key={l.id} className="border-t border-gray-100 align-middle">
                  <td className="px-3 py-2">
                    <input
                      list="pricing-roles"
                      value={l.role}
                      onChange={(e) => setLine(l.id, { role: e.target.value })}
                      placeholder="e.g. Cleaner"
                      aria-label="Role"
                      className="w-36 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <NumInput value={l.people} onChange={(n) => setLine(l.id, { people: n })} step="1" className="w-16" ariaLabel="People" />
                  </td>
                  <td className="px-3 py-2">
                    <NumInput value={l.hoursPerWeek} onChange={(n) => setLine(l.id, { hoursPerWeek: n })} className="w-16" ariaLabel="Hours per week" />
                  </td>
                  <td className="px-3 py-2">
                    <NumInput value={l.billRate} onChange={(n) => setLine(l.id, { billRate: n })} prefix="$" suffix="/hr" ariaLabel="Bill rate" />
                  </td>
                  <td className="px-3 py-2">
                    <NumInput value={l.payRate} onChange={(n) => setLine(l.id, { payRate: n })} prefix="$" suffix="/hr" ariaLabel="Pay rate" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {overriding ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <OverrideInput cents={l.monthlyOverrideCents} onChange={(c) => setLine(l.id, { monthlyOverrideCents: c })} ariaLabel="Line price override" />
                        <button
                          type="button"
                          onClick={() => {
                            setLine(l.id, { monthlyOverrideCents: null });
                            setOverridingLine((prev) => {
                              const next = new Set(prev);
                              next.delete(l.id);
                              return next;
                            });
                          }}
                          className="text-[11px] text-gray-500 hover:underline"
                        >
                          Use calculated {centsToDollars(r.calculatedCents)}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-medium tabular-nums text-gray-900">{centsToDollars(r.priceCents)}</span>
                        <button
                          type="button"
                          onClick={() => setOverridingLine((prev) => new Set(prev).add(l.id))}
                          className="text-[11px] text-pink-600 hover:underline"
                        >
                          Override
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right align-top tabular-nums text-gray-700">
                    <span className="inline-block pt-1.5">{centsToDollars(r.priceCents * 12)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {value.lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(l.id)} aria-label={`Remove ${l.role || "line"}`} className="text-gray-400 hover:text-red-600">
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => onChange({ ...value, lines: [...value.lines, newLine()] })} className="text-sm font-medium text-pink-600 hover:underline">
        + Add role
      </button>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-gray-700">
              Payroll add-on (W2 + health)
              <NumInput value={value.burdenPct} onChange={(n) => onChange({ ...value, burdenPct: n })} suffix="%" className="w-16" ariaLabel="Payroll add-on percent" />
            </label>
            <label className="flex items-center gap-2 text-gray-700">
              Sales tax
              <NumInput value={value.salesTaxPct} onChange={(n) => onChange({ ...value, salesTaxPct: n })} suffix="%" className="w-16" ariaLabel="Sales tax percent" />
            </label>
          </div>

          <div>
            <label className="flex items-center gap-2 font-medium text-gray-700">
              <input
                type="checkbox"
                checked={!!value.overtime}
                onChange={(e) => onChange({ ...value, overtime: e.target.checked ? { people: 1, hoursPerWeek: 4, payRate: firstPayRate } : null })}
                className="h-4 w-4 text-pink-600"
              />
              Include overtime
            </label>
            {value.overtime && (
              <div className="mt-2 flex flex-wrap items-center gap-3 pl-6 text-gray-700">
                <NumInput value={value.overtime.people} onChange={(n) => onChange({ ...value, overtime: { ...value.overtime!, people: n } })} step="1" suffix="people" className="w-14" ariaLabel="Overtime people" />
                <NumInput value={value.overtime.hoursPerWeek} onChange={(n) => onChange({ ...value, overtime: { ...value.overtime!, hoursPerWeek: n } })} suffix="OT hrs/week each" className="w-14" ariaLabel="Overtime hours per week" />
                <NumInput value={value.overtime.payRate} onChange={(n) => onChange({ ...value, overtime: { ...value.overtime!, payRate: n } })} prefix="at $" suffix="/hr" className="w-16" ariaLabel="Overtime pay rate" />
                <p className="w-full text-xs text-gray-500">Adds the extra half-time for those hours (the regular pay is already in the role lines).</p>
              </div>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 font-medium text-gray-700">
              <input
                type="checkbox"
                checked={!!value.holidays}
                onChange={(e) =>
                  onChange({
                    ...value,
                    holidays: e.target.checked
                      ? { days: 7, hoursPerDay: 8, people: value.lines.reduce((s, l) => s + l.people, 0), payRate: firstPayRate }
                      : null,
                  })
                }
                className="h-4 w-4 text-pink-600"
              />
              Include paid holidays
            </label>
            {value.holidays && (
              <div className="mt-2 flex flex-wrap items-center gap-3 pl-6 text-gray-700">
                <NumInput value={value.holidays.days} onChange={(n) => onChange({ ...value, holidays: { ...value.holidays!, days: n } })} step="1" suffix="days/year" className="w-14" ariaLabel="Holiday days per year" />
                <NumInput value={value.holidays.hoursPerDay} onChange={(n) => onChange({ ...value, holidays: { ...value.holidays!, hoursPerDay: n } })} suffix="hrs/day" className="w-14" ariaLabel="Holiday hours per day" />
                <NumInput value={value.holidays.people} onChange={(n) => onChange({ ...value, holidays: { ...value.holidays!, people: n } })} step="1" suffix="people" className="w-14" ariaLabel="Holiday people" />
                <NumInput value={value.holidays.payRate} onChange={(n) => onChange({ ...value, holidays: { ...value.holidays!, payRate: n } })} prefix="at $" suffix="/hr" className="w-16" ariaLabel="Holiday pay rate" />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
            <span className="font-semibold text-gray-900">Price</span>
            <span className="flex items-center gap-2">
              {overridingTotal ? (
                <>
                  <OverrideInput cents={value.totalOverrideCents} onChange={(c) => onChange({ ...value, totalOverrideCents: c })} ariaLabel="Monthly price override" />
                  <span className="text-xs text-gray-500">/mo</span>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ ...value, totalOverrideCents: null });
                      setOverridingTotal(false);
                    }}
                    className="text-[11px] text-gray-500 hover:underline"
                  >
                    Use calculated {centsToDollars(result.calculatedMonthlyCents)}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setOverridingTotal(true)} className="text-[11px] text-pink-600 hover:underline">
                  Override monthly price
                </button>
              )}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="pb-1 text-left font-medium" />
                <th className="pb-1 text-right font-medium">Monthly</th>
                <th className="pb-1 text-right font-medium">Yearly</th>
              </tr>
            </thead>
            <tbody>
              <SummaryRow label="Price" cents={result.monthlyPriceCents} strong />
              <SummaryRow label={`Payroll (incl. ${value.burdenPct}% add-on)`} cents={-result.payrollCents} />
              {value.overtime && <SummaryRow label="Overtime" cents={-result.overtimeCents} />}
              {value.holidays && <SummaryRow label="Paid holidays" cents={-result.holidaysCents} />}
              <SummaryRow label={`Sales tax (${value.salesTaxPct}%)`} cents={-result.salesTaxCents} />
              <tr className="border-t border-gray-100">
                <td className="pt-2 font-semibold text-gray-900">
                  Profit
                  {result.marginPct != null && <span className={`ml-1 text-xs ${marginTone}`}>({Math.round(result.marginPct * 1000) / 10}% margin)</span>}
                </td>
                <td className={`pt-2 text-right font-semibold tabular-nums ${marginTone}`}>{centsToDollars(result.profitCents)}</td>
                <td className={`pt-2 text-right font-semibold tabular-nums ${marginTone}`}>{centsToDollars(result.profitCents * 12)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-gray-500">
            {result.weeklyHours} staff hours a week. Monthly = weekly × 52 ÷ 12 (about 4.33 weeks), so a year is a full 52 weeks.
            Older proposal spreadsheets used 4 weeks a month, which comes out about 8% lower.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, cents, strong = false }: { label: string; cents: number; strong?: boolean }) {
  const fmt = (c: number) => (c < 0 ? `(${centsToDollars(-c)})` : centsToDollars(c));
  return (
    <tr className={strong ? "font-semibold text-gray-900" : "text-gray-700"}>
      <td className="py-0.5">{label}</td>
      <td className="py-0.5 text-right tabular-nums">{fmt(cents)}</td>
      <td className="py-0.5 text-right tabular-nums">{fmt(cents * 12)}</td>
    </tr>
  );
}
