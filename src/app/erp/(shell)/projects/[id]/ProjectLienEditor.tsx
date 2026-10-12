"use client";

import { useCallback, useEffect, useState } from "react";
import { InfoTip, inputClass, labelClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { LienDeadlinePill, lienDetailText } from "@/app/erp/components/LienDeadlinePill";
import { LIEN_ROLE_OPTIONS, LIEN_STATE_OPTIONS, formatLienDay } from "@/lib/erp/lienDeadline";
import type { LienWatchRow } from "@/lib/erp/lienWatch";

const input = inputClass.md;
const label = labelClass.default;

type Props = {
  projectId: string;
  lienState: string | null;
  lienRole: string | null;
  lienResidential: boolean;
};

export function ProjectLienEditor({ projectId, lienState, lienRole, lienResidential }: Props) {
  const [state, setState] = useState(lienState ?? "");
  const [role, setRole] = useState(lienRole ?? "");
  const [residential, setResidential] = useState(lienResidential);
  const [row, setRow] = useState<LienWatchRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(() => {
    fetch(`/api/erp/billing/lien-deadlines?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d: { rows?: LienWatchRow[] }) => setRow(d.rows?.[0] ?? null))
      .catch(() => setRow(null));
  }, [projectId]);
  useEffect(loadStatus, [loadStatus]);

  // The state read off the site address or job title, used while none is picked here.
  const detected =
    row && row.stateSource && row.stateSource !== "SET" ? LIEN_STATE_OPTIONS.find((o) => o.value === row.state) ?? null : null;

  async function save() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lienState: state || null,
          lienRole: role || null,
          lienResidential: residential,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error || "Update failed"); return; }
      loadStatus();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lien deadline</h3>
        <InfoTip text="The last day Sueep can file a lien if this job isn't paid. It counts from the completion date, not the invoice date. General deadlines only, check with an attorney before relying on them." />
        {row && (row.deadline || row.unpaidCents > 0) ? <LienDeadlinePill row={row} /> : null}
        {row?.deadline ? <span className="text-xs text-gray-500">{lienDetailText(row)}</span> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="lien-state">
            <span className="inline-flex items-center gap-1">
              State
              <InfoTip text="Read from the work order's site address, or the job title, when it names a state. Pick one here to override it." />
            </span>
          </label>
          <SearchableSelect
            id="lien-state"
            className="mt-1"
            value={state}
            onChange={setState}
            options={[...LIEN_STATE_OPTIONS]}
            placeholder="Search states…"
            allLabel={detected ? `Use ${detected.label}` : "Not set"}
          />
          {detected && !state ? (
            <p className="mt-1 text-xs text-gray-500">
              {detected.label}, from the {row?.stateSource === "SITE_ADDRESS" ? "site address" : "job title"}
            </p>
          ) : null}
        </div>
        <div>
          <label className={label} htmlFor="lien-role">
            <span className="inline-flex items-center gap-1">
              Hired by
              <InfoTip text="Hired by a general contractor makes Sueep a subcontractor, which has extra steps in some states. Left blank, the stricter rule is used." />
            </span>
          </label>
          <select id="lien-role" className={input} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Not set</option>
            {LIEN_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="lien-property">Property type</label>
          <select
            id="lien-property"
            className={input}
            value={residential ? "RESIDENTIAL" : "COMMERCIAL"}
            onChange={(e) => setResidential(e.target.value === "RESIDENTIAL")}
          >
            <option value="COMMERCIAL">Commercial</option>
            <option value="RESIDENTIAL">Residential</option>
          </select>
        </div>
        <div>
          <span className={label}>
            <span className="inline-flex items-center gap-1">
              Last day of work
              <InfoTip align="right" text="Always the project's completion date. To change it, edit the End date in Project Setup. The clock starts once the project is marked complete." />
            </span>
          </span>
          <p className="mt-1 px-3 py-2 text-sm text-gray-900">
            {row?.completedKey ? formatLienDay(row.completedKey) : <span className="text-gray-400">Not completed yet</span>}
          </p>
        </div>
      </div>

      {row?.deadline ? <p className="text-xs text-gray-500">{row.deadline.rule}</p> : null}
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
