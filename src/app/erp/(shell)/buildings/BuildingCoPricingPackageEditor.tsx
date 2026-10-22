"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CO_ISSUE_PERS,
  CO_ISSUE_PER_LABELS,
  DEFAULT_CO_PRICING_PACKAGE,
  getCoPricingPackage,
  makeCoIssueId,
  sanitizeCoPricingPackage,
  type CoIssuePer,
  type CoPricingPackage,
  type CoSurchargeId,
} from "@/lib/coPricingPackage";
import { Button, InfoTip, useConfirm } from "@/app/erp/components/ui";

type IssueDraft = {
  id: string;
  label: string;
  labelEs: string;
  per: CoIssuePer;
  charge: string;
  subPay: string;
  active: boolean;
};

type SurchargeDraft = { id: CoSurchargeId; label: string; percent: string; active: boolean };

type Props = {
  buildingId: string;
  /** Building.coPricingPackage as saved; null means the default package. */
  initialPackage: unknown;
  canEdit: boolean;
};

const inputCls = "w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:bg-gray-100";

function toDrafts(pkg: CoPricingPackage): { issues: IssueDraft[]; surcharges: SurchargeDraft[] } {
  return {
    issues: pkg.issues.map((i) => ({ ...i, charge: String(i.charge), subPay: String(i.subPay) })),
    surcharges: pkg.surcharges.map((s) => ({ id: s.id, label: s.label, percent: String(s.percent), active: s.active })),
  };
}

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 });
}

export function BuildingCoPricingPackageEditor({ buildingId, initialPackage, canEdit }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isCustom, setIsCustom] = useState(initialPackage != null);
  const [issues, setIssues] = useState<IssueDraft[]>(() => toDrafts(getCoPricingPackage(initialPackage)).issues);
  const [surcharges, setSurcharges] = useState<SurchargeDraft[]>(() => toDrafts(getCoPricingPackage(initialPackage)).surcharges);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const disabled = !canEdit || loading;

  function updateIssue(id: string, patch: Partial<IssueDraft>) {
    setIssues((current) => current.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function moveIssue(index: number, step: -1 | 1) {
    setIssues((current) => {
      const next = [...current];
      const target = index + step;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function addIssue() {
    setIssues((current) => [
      ...current,
      { id: makeCoIssueId(`issue-${current.length + 1}`), label: "", labelEs: "", per: "each", charge: "0", subPay: "0", active: true },
    ]);
  }

  async function removeIssue(issue: IssueDraft) {
    if (issue.label.trim() && !(await confirm({ message: `Remove "${issue.label.trim()}" from this building's CO package?` }))) return;
    setIssues((current) => current.filter((i) => i.id !== issue.id));
  }

  async function send(coPricingPackage: CoPricingPackage | null): Promise<boolean> {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coPricingPackage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to save CO pricing package");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const unnamed = issues.some((i) => !i.label.trim() && (Number(i.charge) > 0 || Number(i.subPay) > 0));
    if (unnamed) {
      setError("Give every issue a name, or remove it.");
      return;
    }
    const pkg = sanitizeCoPricingPackage({ issues, surcharges });
    if (await send(pkg)) {
      const drafts = toDrafts(pkg);
      setIssues(drafts.issues);
      setSurcharges(drafts.surcharges);
      setIsCustom(true);
      setMessage("CO pricing package saved. New CO requests will use these prices.");
    }
  }

  async function resetToDefault() {
    if (!(await confirm({ message: "Replace this building's CO package with the default one? Your changes here will be lost.", confirmLabel: "Reset" }))) return;
    if (await send(null)) {
      const drafts = toDrafts(structuredClone(DEFAULT_CO_PRICING_PACKAGE));
      setIssues(drafts.issues);
      setSurcharges(drafts.surcharges);
      setIsCustom(false);
      setMessage("Reset to the default CO package.");
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-900">CO pricing package</h2>
          <InfoTip
            wide
            text={
              "Issues a sub can pick when they request a change order on this building's turnovers.\n\nCharge is what the property manager sees. Sub pay is what the sub sees. Neither sees the other.\n\nOld requests keep the prices they were sent with."
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isCustom ? "bg-violet-50 text-violet-700" : "bg-gray-100 text-gray-600"}`}>
            {isCustom ? "Custom" : "Default"}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${canEdit ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
            {canEdit ? "Editable" : "View only"}
          </span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
            <tr>
              <th className="w-14 py-2 pr-2" />
              <th className="py-2 pr-3">Issue</th>
              <th className="w-32 py-2 pr-3">Per</th>
              <th className="w-24 py-2 pr-3">Charge $</th>
              <th className="w-24 py-2 pr-3">Sub pay $</th>
              <th className="w-28 py-2 pr-3">Margin</th>
              <th className="w-16 py-2 pr-3">On</th>
              <th className="w-8 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {issues.map((issue, index) => {
              const charge = Number(issue.charge) || 0;
              const subPay = Number(issue.subPay) || 0;
              const margin = charge - subPay;
              const pct = charge > 0 ? Math.round((margin / charge) * 100) : null;
              return (
                <tr key={issue.id} className={issue.active ? "" : "opacity-60"}>
                  <td className="py-2 pr-2 align-top">
                    <div className="flex flex-col text-xs leading-none text-gray-400">
                      <button type="button" onClick={() => moveIssue(index, -1)} disabled={disabled || index === 0} aria-label="Move up" className="px-1 py-0.5 hover:text-gray-700 disabled:opacity-30">
                        ▲
                      </button>
                      <button type="button" onClick={() => moveIssue(index, 1)} disabled={disabled || index === issues.length - 1} aria-label="Move down" className="px-1 py-0.5 hover:text-gray-700 disabled:opacity-30">
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <input value={issue.label} onChange={(e) => updateIssue(issue.id, { label: e.target.value })} disabled={disabled} placeholder="Name, e.g. Wall repair, small" className={inputCls} />
                    <input
                      value={issue.labelEs}
                      onChange={(e) => updateIssue(issue.id, { labelEs: e.target.value })}
                      disabled={disabled}
                      placeholder="Spanish name"
                      aria-label="Spanish name"
                      className={`${inputCls} mt-1 text-xs text-gray-600`}
                    />
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <select value={issue.per} onChange={(e) => updateIssue(issue.id, { per: e.target.value as CoIssuePer })} disabled={disabled} className={inputCls}>
                      {CO_ISSUE_PERS.map((p) => (
                        <option key={p} value={p}>
                          {CO_ISSUE_PER_LABELS[p].en}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <input value={issue.charge} onChange={(e) => updateIssue(issue.id, { charge: e.target.value })} disabled={disabled} type="number" min="0" step="0.01" aria-label="Charge" className={inputCls} />
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <input value={issue.subPay} onChange={(e) => updateIssue(issue.id, { subPay: e.target.value })} disabled={disabled} type="number" min="0" step="0.01" aria-label="Sub pay" className={inputCls} />
                  </td>
                  <td className={`py-2 pr-3 pt-3.5 align-top text-sm ${margin < 0 ? "font-semibold text-red-600" : "text-gray-700"}`}>
                    {money(margin)}
                    {pct != null && <span className="ml-1 text-xs text-gray-500">({pct}%)</span>}
                  </td>
                  <td className="py-2 pr-3 pt-3.5 align-top">
                    <input type="checkbox" checked={issue.active} onChange={(e) => updateIssue(issue.id, { active: e.target.checked })} disabled={disabled} aria-label="Shown to subs" className="h-4 w-4 accent-pink-600" />
                  </td>
                  <td className="py-2 pt-2.5 align-top">
                    <button
                      type="button"
                      onClick={() => removeIssue(issue)}
                      disabled={disabled}
                      aria-label={`Remove ${issue.label || "issue"}`}
                      className="rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            {issues.length === 0 && (
              <tr>
                <td colSpan={8} className="py-4 text-center text-sm text-gray-500">
                  No issues. Subs can only pick Other.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addIssue}
        disabled={disabled}
        className="mt-3 rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:border-pink-400 hover:text-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Add issue
      </button>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Surcharges</h3>
          <InfoTip text="Added by the office when reviewing a request. The percent goes on top of both the charge and the sub pay." />
        </div>
        <div className="mt-2 flex flex-wrap gap-3">
          {surcharges.map((s) => (
            <div key={s.id} className={`flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 ${s.active ? "" : "opacity-60"}`}>
              <span className="w-24 text-sm font-medium text-gray-900">{s.label}</span>
              <span className="text-sm text-gray-500">+</span>
              <input
                value={s.percent}
                onChange={(e) => setSurcharges((cur) => cur.map((x) => (x.id === s.id ? { ...x, percent: e.target.value } : x)))}
                disabled={disabled}
                type="number"
                min="0"
                max="200"
                aria-label={`${s.label} percent`}
                className="w-20 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:bg-gray-100"
              />
              <span className="text-sm text-gray-500">%</span>
              <label className="ml-2 flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={s.active}
                  onChange={(e) => setSurcharges((cur) => cur.map((x) => (x.id === s.id ? { ...x, active: e.target.checked } : x)))}
                  disabled={disabled}
                  className="h-4 w-4 accent-pink-600"
                />
                On
              </label>
            </div>
          ))}
        </div>
      </div>

      {error ? <p className="mt-3 text-xs text-red-600" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-xs text-emerald-700" role="status">{message}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="md" type="button" onClick={save} disabled={disabled}>
          {loading ? "Saving..." : "Save CO package"}
        </Button>
        {isCustom && (
          <Button variant="secondary" size="md" type="button" onClick={resetToDefault} disabled={disabled}>
            Reset to default
          </Button>
        )}
      </div>
    </section>
  );
}
