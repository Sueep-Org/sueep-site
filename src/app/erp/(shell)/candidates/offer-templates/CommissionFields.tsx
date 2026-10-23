"use client";

import { useEffect, useState } from "react";
import { InfoTip, inputClass, labelClass } from "@/app/erp/components/ui";
import { commissionTables, formatMillions, parseMoneyCents, type CommissionPlan } from "@/lib/erp/offerCommission";

/** Money box that takes "$1M", "250k" or "1,000,000" and tidies up on blur. */
function MoneyInput({ cents, onChange, id }: { cents: number; onChange: (c: number) => void; id?: string }) {
  const [text, setText] = useState(formatMillions(cents, true));
  useEffect(() => setText(formatMillions(cents, true)), [cents]);
  return (
    <input
      id={id}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const c = parseMoneyCents(text);
        if (c != null) onChange(c);
        else setText(formatMillions(cents, true));
      }}
      className={inputClass.sm}
    />
  );
}

function PctInput({ value, onChange, id }: { value: number; onChange: (n: number) => void; id?: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        step="0.25"
        min={0}
        max={100}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className={`${inputClass.sm} pr-6`}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
    </div>
  );
}

function Group({ title, show, onShow, children, tip }: { title: string; show: boolean; onShow: (v: boolean) => void; children: React.ReactNode; tip?: string }) {
  return (
    <div className="space-y-2 border-t border-gray-100 pt-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
        <input type="checkbox" checked={show} onChange={(e) => onShow(e.target.checked)} />
        {title}
        {tip ? <InfoTip text={tip} /> : null}
      </label>
      {show ? <div className="space-y-2 pl-6">{children}</div> : null}
    </div>
  );
}

const rowBtn = "px-1 text-gray-400 hover:text-red-600";
const addBtn = "text-xs font-medium text-pink-600 hover:underline";

/**
 * The numbers behind the commission tables. `compact` folds the
 * accelerators, tiers and example away (letter page) so the usual changes,
 * rate and margin, are all that shows at first.
 */
export function CommissionFields({
  plan,
  onChange,
  compact = false,
  disabled = false,
}: {
  plan: CommissionPlan;
  onChange: (p: CommissionPlan) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const set = <K extends keyof CommissionPlan>(key: K, v: CommissionPlan[K]) => onChange({ ...plan, [key]: v });
  const [marginsText, setMarginsText] = useState(plan.example.marginsPct.join(", "));
  useEffect(() => setMarginsText(plan.example.marginsPct.join(", ")), [plan.example.marginsPct]);

  const more = (
    <>
      <Group
        title="Accelerators"
        show={plan.accelerators.show}
        onShow={(show) => set("accelerators", { ...plan.accelerators, show })}
        tip="Higher rates once yearly revenue passes each amount. Each row runs up to the next row's amount."
      >
        <input value={plan.accelerators.heading} onChange={(e) => set("accelerators", { ...plan.accelerators, heading: e.target.value })} placeholder="Heading" className={`${inputClass.sm} font-medium`} />
        <input value={plan.accelerators.note} onChange={(e) => set("accelerators", { ...plan.accelerators, note: e.target.value })} placeholder="Note under the heading" className={inputClass.sm} />
        <div className="grid grid-cols-[1fr_6rem_1.5rem] gap-1.5 text-[11px] text-gray-500">
          <span>Revenue from</span>
          <span>Rate</span>
          <span />
          {plan.accelerators.rows.map((row, i) => (
            <AccelRow
              key={i}
              row={row}
              onChange={(r) => set("accelerators", { ...plan.accelerators, rows: plan.accelerators.rows.map((x, j) => (j === i ? r : x)) })}
              onRemove={() => set("accelerators", { ...plan.accelerators, rows: plan.accelerators.rows.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
        <button
          type="button"
          className={addBtn}
          onClick={() => {
            const last = plan.accelerators.rows[plan.accelerators.rows.length - 1];
            set("accelerators", { ...plan.accelerators, rows: [...plan.accelerators.rows, { fromCents: (last?.fromCents ?? 0) + 100_000_000, ratePct: (last?.ratePct ?? plan.ratePct) + 0.5 }] });
          }}
        >
          + Add row
        </button>
      </Group>

      <Group
        title="Margin tiers"
        show={plan.tiers.show}
        onShow={(show) => set("tiers", { ...plan.tiers, show })}
        tip="The rate paid depends on the project's final margin. Each row starts at its margin and runs up to the row above. The example table uses these too."
      >
        <input value={plan.tiers.heading} onChange={(e) => set("tiers", { ...plan.tiers, heading: e.target.value })} placeholder="Heading" className={`${inputClass.sm} font-medium`} />
        <input value={plan.tiers.note} onChange={(e) => set("tiers", { ...plan.tiers, note: e.target.value })} placeholder="Note under the heading" className={inputClass.sm} />
        <div className="grid grid-cols-[5rem_5rem_1fr_1.5rem] gap-1.5 text-[11px] text-gray-500">
          <span>Margin from</span>
          <span>Rate</span>
          <span>Rationale</span>
          <span />
          {plan.tiers.rows.map((row, i) => {
            const update = (r: Partial<typeof row>) => set("tiers", { ...plan.tiers, rows: plan.tiers.rows.map((x, j) => (j === i ? { ...x, ...r } : x)) });
            return (
              <TierCells
                key={i}
                row={row}
                onChange={update}
                onRemove={() => set("tiers", { ...plan.tiers, rows: plan.tiers.rows.filter((_, j) => j !== i) })}
              />
            );
          })}
        </div>
        <button type="button" className={addBtn} onClick={() => set("tiers", { ...plan.tiers, rows: [...plan.tiers.rows, { minPct: 0, ratePct: 0, note: "" }] })}>
          + Add row
        </button>
      </Group>

      <Group title="Example" show={plan.example.show} onShow={(show) => set("example", { ...plan.example, show })} tip="Payout on one project at a few margins, using the margin tiers.">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass.compact} htmlFor="cm-project">Project size</label>
            <MoneyInput id="cm-project" cents={plan.example.projectCents} onChange={(projectCents) => set("example", { ...plan.example, projectCents })} />
          </div>
          <div>
            <label className={labelClass.compact} htmlFor="cm-margins">Margins (%)</label>
            <input
              id="cm-margins"
              value={marginsText}
              onChange={(e) => setMarginsText(e.target.value)}
              onBlur={() => {
                const list = marginsText.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
                set("example", { ...plan.example, marginsPct: list.slice(0, 12) });
              }}
              placeholder="35, 30, 27, 22, 18"
              className={inputClass.sm}
            />
          </div>
        </div>
      </Group>
    </>
  );

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={`${labelClass.compact} flex items-center gap-1`} htmlFor="cm-rate">
            Commission rate
            <InfoTip text="Share of gross profit paid as commission. The rate in the letter's intro line follows this." />
          </label>
          <PctInput id="cm-rate" value={plan.ratePct} onChange={(ratePct) => set("ratePct", ratePct)} />
        </div>
        <div>
          <label className={`${labelClass.compact} flex items-center gap-1`} htmlFor="cm-margin">
            Assumed margin
            <InfoTip text="Margin used for the earnings ladder." />
          </label>
          <PctInput id="cm-margin" value={plan.marginPct} onChange={(marginPct) => set("marginPct", marginPct)} />
        </div>
      </div>

      <Group
        title="Earnings ladder"
        show={plan.ladder.show}
        onShow={(show) => set("ladder", { ...plan.ladder, show })}
        tip="Commission and total pay at each level of yearly revenue closed. Total = salary + commission."
      >
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelClass.compact} htmlFor="cm-from">Revenue from</label>
            <MoneyInput id="cm-from" cents={plan.ladder.fromCents} onChange={(fromCents) => set("ladder", { ...plan.ladder, fromCents })} />
          </div>
          <div>
            <label className={labelClass.compact} htmlFor="cm-to">To</label>
            <MoneyInput id="cm-to" cents={plan.ladder.toCents} onChange={(toCents) => set("ladder", { ...plan.ladder, toCents })} />
          </div>
          <div>
            <label className={labelClass.compact} htmlFor="cm-step">Step</label>
            <MoneyInput id="cm-step" cents={plan.ladder.stepCents} onChange={(stepCents) => set("ladder", { ...plan.ladder, stepCents: Math.max(1_000_000, stepCents) })} />
          </div>
        </div>
      </Group>

      {compact ? (
        <details className="group border-t border-gray-100 pt-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-pink-700">Accelerators, tiers and example</summary>
          <div className="mt-2 space-y-3">{more}</div>
        </details>
      ) : (
        more
      )}
    </fieldset>
  );
}

function AccelRow({ row, onChange, onRemove }: { row: { fromCents: number; ratePct: number }; onChange: (r: { fromCents: number; ratePct: number }) => void; onRemove: () => void }) {
  return (
    <>
      <MoneyInput cents={row.fromCents} onChange={(fromCents) => onChange({ ...row, fromCents })} />
      <PctInput value={row.ratePct} onChange={(ratePct) => onChange({ ...row, ratePct })} />
      <button type="button" onClick={onRemove} className={rowBtn} aria-label="Remove row">×</button>
    </>
  );
}

function TierCells({
  row,
  onChange,
  onRemove,
}: {
  row: { minPct: number; ratePct: number; note: string };
  onChange: (r: Partial<{ minPct: number; ratePct: number; note: string }>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <PctInput value={row.minPct} onChange={(minPct) => onChange({ minPct })} />
      <PctInput value={row.ratePct} onChange={(ratePct) => onChange({ ratePct })} />
      <input value={row.note} onChange={(e) => onChange({ note: e.target.value })} className={inputClass.sm} />
      <button type="button" onClick={onRemove} className={rowBtn} aria-label="Remove row">×</button>
    </>
  );
}

/** The tables as they'll print, for the template editor's letter view. */
export function CommissionTablesView({ plan, baseCents, title }: { plan: CommissionPlan; baseCents: number | null; title: string }) {
  const tables = commissionTables(plan, baseCents, title);
  if (!tables.length) return <p className="my-3 text-xs text-gray-400">All commission tables are turned off.</p>;
  return (
    <div className="space-y-4">
      {tables.map((t, i) => (
        <div key={i}>
          {t.heading ? <p className="font-semibold">{t.heading}</p> : null}
          {t.note ? <p className="mb-2 font-semibold">{t.note}</p> : null}
          <table className="w-full table-fixed border-collapse text-[12px]">
            <thead>
              <tr>
                {t.columns.map((c) => (
                  <th key={c} className="border border-gray-700 px-2 py-1.5 text-left font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k} className="border border-gray-700 px-2 py-1.5">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
