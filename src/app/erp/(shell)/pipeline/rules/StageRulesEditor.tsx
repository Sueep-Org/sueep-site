"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { MISSING_LABELS, type MissingField } from "@/lib/erp/pipelineMissing";
import type { StageNextStep, StageRule } from "@/lib/erp/dealStageRules";

type StepDraft = { text: string; days: string; onBidDate: boolean };
const toDraft = (s: StageNextStep | null): StepDraft => (s ? { text: s.text, days: String(s.days), onBidDate: s.onBidDate } : { text: "", days: "3", onBidDate: false });

/** Required fields (one tick box per field) and the automatic next step, one row per open stage. Saves all stages at once. */
export function StageRulesEditor({
  pipeline,
  rules,
  suggestions,
  fields,
  canEdit,
}: {
  pipeline: "post-con" | "janitorial";
  rules: StageRule[];
  suggestions: Record<string, StageNextStep | null>;
  fields: MissingField[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [required, setRequired] = useState<Record<string, MissingField[]>>(() => Object.fromEntries(rules.map((r) => [r.stageId, r.required])));
  const [steps, setSteps] = useState<Record<string, StepDraft>>(() => Object.fromEntries(rules.map((r) => [r.stageId, toDraft(r.nextStep)])));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const label = (f: MissingField) => (f === "company" ? (pipeline === "janitorial" ? "Company" : "GC") : MISSING_LABELS[f]);
  const anyCustom = rules.some((r) => r.custom);

  function setStep(stageId: string, patch: Partial<StepDraft>) {
    setSteps((m) => ({ ...m, [stageId]: { ...m[stageId], ...patch } }));
    setDirty(true);
  }

  /** Fills stages that have no step yet; nothing saves until Save. */
  function applySuggested() {
    setSteps((m) => Object.fromEntries(rules.map((r) => [r.stageId, m[r.stageId]?.text.trim() ? m[r.stageId] : toDraft(suggestions[r.stageId] ?? null)])));
    setDirty(true);
  }

  function toggle(stageId: string, f: MissingField, on: boolean) {
    setRequired((m) => ({ ...m, [stageId]: on ? [...(m[stageId] ?? []), f] : (m[stageId] ?? []).filter((x) => x !== f) }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/erp/pipeline/stage-rules", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pipeline,
        rules: rules.map((r) => {
          const s = steps[r.stageId];
          return {
            stageId: r.stageId,
            required: required[r.stageId] ?? [],
            nextStep: s?.text.trim() ? { text: s.text.trim(), days: Number(s.days) || 0, onBidDate: s.onBidDate } : null,
          };
        }),
      }),
    }).catch(() => null);
    setSaving(false);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) return toast(data?.error || "Couldn't save", "error");
    setDirty(false);
    toast("Stage rules saved.");
    router.refresh();
  }

  async function reset() {
    if (!(await confirm({ message: "Go back to the standard required fields for every stage, with no automatic next steps?", confirmLabel: "Reset", danger: false }))) return;
    const res = await fetch(`/api/erp/pipeline/stage-rules?pipeline=${pipeline}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast("Couldn't reset", "error");
    toast("Back to the standard rules.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-gray-300 bg-gray-200 text-xs uppercase text-gray-700">
            <tr>
              <th className="px-4 py-2 font-semibold">Stage</th>
              {fields.map((f) => (
                <th key={f} className="px-3 py-2 text-center font-semibold">{label(f)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={r.stageId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-4 py-2.5 font-medium text-gray-800">{r.label}</td>
                {fields.map((f) => (
                  <td key={f} className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${r.label}: ${label(f)}`}
                      checked={(required[r.stageId] ?? []).includes(f)}
                      disabled={!canEdit}
                      onChange={(e) => toggle(r.stageId, f, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          Automatic next steps
          <InfoTip
            wide
            text={`When a deal moves forward into a stage with a step here, its owner gets that next step, due in the days set${pipeline === "post-con" ? " (or on the Bid Date, when ticked and the deal has a future one)" : ""}. It never replaces a next step the deal already has. Leave the text empty for no automatic step. Works for moves on the board right away, and for moves made in HubSpot within the hour.`}
          />
        </h2>
        {canEdit && (
          <button type="button" onClick={applySuggested} className="text-xs font-medium text-pink-600 hover:underline">
            Use suggested steps
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-gray-300 bg-gray-200 text-xs uppercase text-gray-700">
            <tr>
              <th className="px-4 py-2 font-semibold">Stage</th>
              <th className="px-3 py-2 font-semibold">Next step</th>
              <th className="w-28 px-3 py-2 font-semibold">Due in days</th>
              {pipeline === "post-con" && <th className="w-28 px-3 py-2 text-center font-semibold">On bid date</th>}
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => {
              const s = steps[r.stageId] ?? toDraft(null);
              return (
                <tr key={r.stageId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-4 py-2 font-medium text-gray-800">{r.label}</td>
                  <td className="px-3 py-2">
                    <input
                      value={s.text}
                      onChange={(e) => setStep(r.stageId, { text: e.target.value })}
                      disabled={!canEdit}
                      maxLength={200}
                      placeholder="None"
                      aria-label={`${r.label}: next step`}
                      className={inputClass.sm}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={s.days}
                      onChange={(e) => setStep(r.stageId, { days: e.target.value })}
                      disabled={!canEdit || !s.text.trim()}
                      aria-label={`${r.label}: due in days`}
                      className={inputClass.sm}
                    />
                  </td>
                  {pipeline === "post-con" && (
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={s.onBidDate}
                        onChange={(e) => setStep(r.stageId, { onBidDate: e.target.checked })}
                        disabled={!canEdit || !s.text.trim()}
                        aria-label={`${r.label}: due on the bid date`}
                        className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="flex items-center justify-end gap-2">
          {anyCustom && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset to standard
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Only Admins and the Business Manager can change these.</p>
      )}
    </div>
  );
}
