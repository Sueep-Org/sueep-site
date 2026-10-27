"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, InfoTip, inputClass, labelClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { LienDeadlinePill, lienDetailText } from "@/app/erp/components/LienDeadlinePill";
import { LIEN_DECISION_OPTIONS, LIEN_ROLE_OPTIONS, LIEN_STATE_OPTIONS, formatLienDay } from "@/lib/erp/lienDeadline";
import type { LienWatchRow } from "@/lib/erp/lienWatch";
import { formatUnitDisplay } from "@/lib/erp/unitDisplay";

const input = inputClass.md;
const label = labelClass.default;

/** A post-construction job, or a building (its unit turns are liened together). */
export type LienTarget = { kind: "project"; id: string } | { kind: "building"; id: string };

type Props = {
  target: LienTarget;
  /** The attorney packet, under the steps (projects only) */
  renderPacket?: (onPrepared: () => void) => React.ReactNode;
  lienState: string | null;
  lienRole: string | null;
  lienResidential: boolean;
  lienNoticeSentOnIso: string | null;
  lienDecision: string | null;
  lienDecisionNote: string | null;
  lienNoticeTracking: string | null;
  lienOwnerName: string | null;
  lienOwnerAddress: string | null;
  lienGcName: string | null;
  lienGcAddress: string | null;
};

/**
 * The Liens tab: state, who hired us, parties, decision and the lien steps.
 * Used on post-construction projects and on buildings.
 */
export function LienEditor({
  target,
  renderPacket,
  lienState,
  lienRole,
  lienResidential,
  lienNoticeSentOnIso,
  lienDecision,
  lienDecisionNote,
  lienNoticeTracking,
  lienOwnerName,
  lienOwnerAddress,
  lienGcName,
  lienGcAddress,
}: Props) {
  const [state, setState] = useState(lienState ?? "");
  const [role, setRole] = useState(lienRole ?? "");
  const [residential, setResidential] = useState(lienResidential);
  const [noticeSent, setNoticeSent] = useState(lienNoticeSentOnIso ? lienNoticeSentOnIso.slice(0, 10) : "");
  const [decision, setDecision] = useState(lienDecision ?? "");
  const [decisionNote, setDecisionNote] = useState(lienDecisionNote ?? "");
  const [noticeTracking, setNoticeTracking] = useState(lienNoticeTracking ?? "");
  const [ownerName, setOwnerName] = useState(lienOwnerName ?? "");
  const [ownerAddress, setOwnerAddress] = useState(lienOwnerAddress ?? "");
  const [gcName, setGcName] = useState(lienGcName ?? "");
  const [gcAddress, setGcAddress] = useState(lienGcAddress ?? "");
  const [tickingStep, setTickingStep] = useState<string | null>(null);
  const [row, setRow] = useState<LienWatchRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(() => {
    fetch(`/api/erp/billing/lien-deadlines?${target.kind === "project" ? "projectId" : "buildingId"}=${encodeURIComponent(target.id)}`)
      .then((r) => r.json())
      .then((d: { rows?: LienWatchRow[] }) => setRow(d.rows?.[0] ?? null))
      .catch(() => setRow(null));
  }, [target.kind, target.id]);
  useEffect(loadStatus, [loadStatus]);
  const isBuilding = target.kind === "building";
  const patchUrl = isBuilding ? `/api/erp/buildings/${target.id}/lien` : `/api/erp/projects/${target.id}`;

  // The state read off the site address or job title, used while none is picked here.
  const detected =
    row && row.stateSource && row.stateSource !== "SET" ? LIEN_STATE_OPTIONS.find((o) => o.value === row.state) ?? null : null;

  async function save() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lienState: state || null,
          lienRole: role || null,
          lienResidential: residential,
          lienNoticeSentOn: noticeSent || null,
          lienDecision: decision || null,
          lienDecisionNote: decisionNote,
          lienNoticeTracking: noticeTracking,
          lienOwnerName: ownerName,
          lienOwnerAddress: ownerAddress,
          lienGcName: gcName,
          lienGcAddress: gcAddress,
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

  // Ticks save on their own, apart from the Save button, so a step is never lost with unsaved fields.
  async function tickStep(key: string, done: boolean) {
    setError("");
    setTickingStep(key);
    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lienStep: { key, done } }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error || "Update failed"); return; }
      loadStatus();
    } catch {
      setError("Network error");
    } finally {
      setTickingStep(null);
    }
  }

  const hiredByContractor = role !== "DIRECT";

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lien deadline</h3>
        <InfoTip
          text={
            isBuilding
              ? "The last day Sueep can file a lien on this building for its unpaid unit turns. Each turn counts from the day it was completed, and the building shows the earliest one still open. General deadlines only, check with an attorney before relying on them."
              : "The last day Sueep can file a lien if this job isn't paid. It counts from the completion date, not the invoice date. General deadlines only, check with an attorney before relying on them."
          }
        />
        {row && (row.deadline || row.unpaidCents > 0) ? <LienDeadlinePill row={row} /> : null}
        {row?.deadline ? <span className="text-xs text-gray-500">{lienDetailText(row)}</span> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={label} htmlFor="lien-state">
            <span className="inline-flex items-center gap-1">
              State
              <InfoTip
                text={
                  isBuilding
                    ? "Read from the building's address, or its name, when it names a state. Pick one here to override it."
                    : "Read from the work order's site address, or the job title, when it names a state. Pick one here to override it."
                }
              />
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
              {detected.label}, from the {row?.stateSource === "SITE_ADDRESS" ? "site address" : row?.stateSource === "BUILDING_ADDRESS" ? "building address" : "job title"}
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
              <InfoTip
                align="right"
                text={
                  isBuilding
                    ? "The completion date of the turn that sets the deadline: the one whose lien window closes first, among those still open. Each turn's own date is listed below."
                    : "Always the project's completion date. To change it, edit the End date in Project Setup. The clock starts once the project is marked complete."
                }
              />
            </span>
          </span>
          <p className="mt-1 px-3 py-2 text-sm text-gray-900">
            {row?.completedKey ? formatLienDay(row.completedKey) : <span className="text-gray-400">Not completed yet</span>}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Parties</h4>
          <InfoTip text="Who a lien notice is addressed to. Use the legal name and the mailing address, since notices go by mail." />
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="lien-owner-name">Property owner</label>
            <input id="lien-owner-name" type="text" className={input} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Legal name" maxLength={200} />
            <textarea id="lien-owner-address" aria-label="Property owner mailing address" rows={2} className={input} value={ownerAddress} onChange={(e) => setOwnerAddress(e.target.value)} placeholder="Mailing address" maxLength={400} />
          </div>
          {hiredByContractor ? (
            <div>
              <label className={label} htmlFor="lien-gc-name">General contractor</label>
              <input id="lien-gc-name" type="text" className={input} value={gcName} onChange={(e) => setGcName(e.target.value)} placeholder="Legal name" maxLength={200} />
              <textarea id="lien-gc-address" aria-label="General contractor mailing address" rows={2} className={input} value={gcAddress} onChange={(e) => setGcAddress(e.target.value)} placeholder="Mailing address" maxLength={400} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div>
          <label className={label} htmlFor="lien-decision">
            <span className="inline-flex items-center gap-1">
              Decision
              <InfoTip text="What was decided about a lien on this job. Not pursuing and Lien filed take it off the Lien deadlines list and stop its alert emails. Who set it and when are saved." />
            </span>
          </label>
          <select id="lien-decision" className={input} value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="">Not decided</option>
            {LIEN_DECISION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {decision ? (
          <div>
            <label className={label} htmlFor="lien-decision-note">Note</label>
            <input
              id="lien-decision-note"
              type="text"
              className={input}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder="Why, or what happens next"
              maxLength={300}
            />
            {row?.decision?.onKey ? (
              <p className="mt-1 text-xs text-gray-500">
                Set{row.decision.by ? ` by ${row.decision.by.split("@")[0]}` : ""} on {formatLienDay(row.decision.onKey)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {row?.deadline ? <p className="text-xs text-gray-500">{row.deadline.rule}</p> : null}

      {isBuilding && row && row.units.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Unpaid turns</h4>
          <table className="mt-1 w-full max-w-xl text-left text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Unit</th>
                <th className="py-1 pr-3 font-medium">Completed</th>
                <th className="py-1 pr-3 font-medium">File by</th>
                <th className="py-1 text-right font-medium">Unpaid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {row.units.map((u) => (
                <tr key={u.projectId}>
                  <td className="py-1 pr-3">
                    <a href={`/erp/projects/${u.projectId}`} className="text-gray-900 hover:text-pink-600 hover:underline">
                      {formatUnitDisplay(u.unitNumber) || "Unit"}
                    </a>
                  </td>
                  <td className="py-1 pr-3 text-gray-600">{u.completedKey ? formatLienDay(u.completedKey) : "Not complete"}</td>
                  <td className={`py-1 pr-3 ${u.deadlineKey && u.deadlineKey === row.deadline?.deadlineKey ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                    {u.deadlineKey ? formatLienDay(u.deadlineKey) : "-"}
                  </td>
                  <td className="py-1 text-right tabular-nums text-gray-900">
                    {(u.unpaidCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}

      <Button size="xs" type="button"
        onClick={save}
        disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>

      {row?.readiness ? (
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-gray-700">Lien steps</h4>
            <InfoTip text="The steps to a lien on this job, in order. Grayed boxes are worked out by the ERP. The others are ticked by a person, and who ticked each one and when is saved. Steps marked optional don't hold up Ready to file." />
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${row.readiness.canFileNow ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
              {row.readiness.canFileNow ? "Ready to file" : "Not ready"}
            </span>
          </div>
          <ul className="mt-2 divide-y divide-gray-100">
            {row.readiness.steps.map((st, i) => {
              const firstAfter = st.afterFiling && !row.readiness!.steps[i - 1]?.afterFiling;
              return (
                <li key={st.key} className={`py-1.5 text-xs ${firstAfter ? "mt-2 border-t-2 border-gray-200 pt-2" : ""}`}>
                  {firstAfter ? <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">After filing</p> : null}
                  <div className="flex items-start gap-2">
                    <input
                      id={`lien-step-${st.key}`}
                      type="checkbox"
                      checked={st.done}
                      disabled={st.kind !== "MANUAL" || tickingStep === st.key}
                      onChange={(e) => st.manualKey && tickStep(st.manualKey, e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-pink-600 disabled:opacity-60"
                    />
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`lien-step-${st.key}`} className={st.done ? "text-gray-500" : "text-gray-900"}>
                        {st.label}
                        {!st.required && !st.afterFiling ? <span className="ml-1.5 text-[10px] text-gray-400">optional</span> : null}
                      </label>
                      {st.detail ? <span className="ml-2 text-gray-500">{st.detail}</span> : null}
                      {st.kind === "MANUAL" && st.done && st.onKey ? (
                        <span className="ml-2 text-gray-400">
                          {st.by ? `${st.by.split("@")[0]}, ` : ""}
                          {formatLienDay(st.onKey)}
                        </span>
                      ) : null}
                      {st.kind === "NOTICE" ? (
                        <div className="mt-1.5 flex flex-wrap items-end gap-2">
                          <div>
                            <label className={label} htmlFor="lien-notice-sent">Mailed on</label>
                            <input id="lien-notice-sent" type="date" className={inputClass.xs} value={noticeSent} onChange={(e) => setNoticeSent(e.target.value)} />
                          </div>
                          <div>
                            <label className={label} htmlFor="lien-notice-tracking">Tracking number</label>
                            <input id="lien-notice-tracking" type="text" className={inputClass.xs} value={noticeTracking} onChange={(e) => setNoticeTracking(e.target.value)} placeholder="Certified mail" maxLength={80} />
                          </div>
                          <button type="button" onClick={save} disabled={saving} className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                            {saving ? "Saving…" : "Save"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {row?.deadline && renderPacket ? renderPacket(loadStatus) : null}
    </div>
  );
}
