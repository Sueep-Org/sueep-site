"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, inputClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { valueOn, type Dated, type DatedMode } from "@/lib/erp/datedSettings";
import { DEFAULT_COMMISSION_TIERS, type MarginTier } from "@/lib/erp/payrollRules";
import { todayEasternKey } from "@/lib/erp/dates";
import { DatedSaveModal } from "./DatedSaveModal";

type Draft = { minMarginPercent: string; basePct: string; acceleratorPct: string };

const pct = (rate: number) => String(Math.round(rate * 10000) / 100);
const toDraft = (tiers: MarginTier[]): Draft[] =>
  tiers.map((t) => ({ minMarginPercent: String(t.minMarginPercent), basePct: pct(t.baseRate), acceleratorPct: pct(t.acceleratorRate) }));
const summary = (tiers: MarginTier[]) => tiers.map((t) => `${t.minMarginPercent}%+ margin: ${pct(t.baseRate)}% / ${pct(t.acceleratorRate)}%`).join(", ");

const dayText = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

const DEALS = { appliesTo: "Deals finished from", many: "deals", one: "deal" };

/** One-time deal commission by margin, on Settings, Commission. Saving asks when the change starts. */
export function CommissionTiersEditor({ history, saved }: { history: Dated<MarginTier[]>; saved: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const current = valueOn(history, todayEasternKey());
  const [rows, setRows] = useState<Draft[]>(() => toDraft(current));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function parsed(): MarginTier[] | null {
    const tiers = rows.map((r) => ({
      minMarginPercent: Number(r.minMarginPercent),
      baseRate: Number(r.basePct) / 100,
      acceleratorRate: Number(r.acceleratorPct) / 100,
    }));
    const bad = tiers.some((t) => [t.minMarginPercent, t.baseRate, t.acceleratorRate].some((n) => !Number.isFinite(n)) || t.baseRate < 0 || t.baseRate > 1 || t.acceleratorRate < 0 || t.acceleratorRate > 1);
    if (!tiers.length || bad) return null;
    return [...tiers].sort((a, b) => b.minMarginPercent - a.minMarginPercent);
  }
  const next = parsed();
  const dirty = !next || JSON.stringify(next) !== JSON.stringify(current);

  function update(i: number, patch: Partial<Draft>) {
    setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setError("");
  }

  async function send(method: "PUT" | "DELETE", mode?: DatedMode) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/erp/settings/commission-tiers", {
      method,
      headers: { "content-type": "application/json" },
      body: method === "PUT" ? JSON.stringify({ value: next, mode }) : undefined,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not save. Try again.");
    setAsking(false);
    if (method === "DELETE") setRows(toDraft(DEFAULT_COMMISSION_TIERS));
    toast(method === "PUT" ? "Commission tiers saved" : "Commission tiers back to default");
    router.refresh();
  }

  async function reset() {
    const ok = await confirm({
      title: "Reset to default?",
      message: `This puts the built-in tiers (${summary(DEFAULT_COMMISSION_TIERS)}) back for every date, past deals too. Commission shown may change.`,
      confirmLabel: "Reset",
    });
    if (ok) send("DELETE");
  }

  return (
    <div className="space-y-3">
      <table className="w-full max-w-xl text-left text-sm">
        <thead className="text-xs uppercase text-gray-500">
          <tr>
            <th className="py-1.5 pr-3">Margin at least</th>
            <th className="py-1.5 pr-3">Base rate</th>
            <th className="py-1.5 pr-3">Accelerator rate</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {(["minMarginPercent", "basePct", "acceleratorPct"] as const).map((field) => (
                <td key={field} className="py-1 pr-3">
                  <span className="flex items-center gap-1 text-gray-600">
                    <input
                      type="number"
                      step="any"
                      className={`${inputClass.sm} w-20 text-right`}
                      value={r[field]}
                      onChange={(e) => update(i, { [field]: e.target.value })}
                      aria-label={field}
                      disabled={busy}
                    />
                    %
                  </span>
                </td>
              ))}
              <td className="py-1">
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows((list) => list.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-600" aria-label="Remove tier" disabled={busy}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-400">
        Below the lowest margin: no commission. The accelerator rate is for revenue past the yearly amount below.
        {history.length > 1 && (
          <>
            {" "}
            Changed over time: {history.map((e) => (e.from ? `from ${dayText(e.from)}: ${summary(e.value)}` : `before that: ${summary(e.value)}`)).reverse().join("; ")}.
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" type="button" disabled={busy || rows.length >= 10} onClick={() => setRows((list) => [...list, { minMarginPercent: "0", basePct: "0", acceleratorPct: "0" }])}>
          + Add tier
        </Button>
        <Button
          size="sm"
          type="button"
          disabled={busy || !dirty}
          onClick={() => (next ? setAsking(true) : setError("Every box needs a number. Rates are 0 to 100%."))}
        >
          Save tiers
        </Button>
        {dirty && (
          <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => setRows(toDraft(current))}>
            Cancel
          </Button>
        )}
        {saved && !dirty && (
          <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={reset}>
            Reset to default
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {asking && next && (
        <DatedSaveModal
          label="Commission tiers"
          dated={DEALS}
          oldText={summary(current)}
          newText={summary(next)}
          defaultFrom={todayEasternKey()}
          busy={busy}
          onCancel={() => setAsking(false)}
          onSave={(mode) => send("PUT", mode)}
        />
      )}
    </div>
  );
}
