"use client";

import { useEffect, useState } from "react";
import { turnoverScopeLabel } from "@/lib/erp/turnoverScope";

type Props = {
  projectId: string;
  /** TURNOVER_SCOPE_OPTIONS values actually contracted for this unit. */
  contractedScopeItems: string[];
  initialCompletedScopeItems: string[];
  canEdit: boolean;
};

/** Standalone "is this part of the unit's scope actually finished" checklist,
 * same idea as the Schedule of Values checklist (ProjectSOVSection): a plain
 * list you can check off any time, independent of logging labor. Checking an
 * item here also removes it from what the schedule's scope picker offers, so
 * a finished item can't be scheduled again. */
export function UnitScopeChecklist({ projectId, contractedScopeItems, initialCompletedScopeItems, canEdit }: Props) {
  const [completed, setCompleted] = useState<Set<string>>(new Set(initialCompletedScopeItems));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCompleted(new Set(initialCompletedScopeItems));
  }, [initialCompletedScopeItems]);

  async function toggle(value: string) {
    const next = new Set(completed);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setCompleted(next);
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/scope-items`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completedScopeItems: Array.from(next) }),
      });
      if (!res.ok) {
        setCompleted(completed);
        setError("Failed to save");
      }
    } catch {
      setCompleted(completed);
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (contractedScopeItems.length === 0) return null;

  const doneCount = contractedScopeItems.filter((v) => completed.has(v)).length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-gray-900">Work scope</h2>
        <span className="text-xs text-gray-500">
          {doneCount} / {contractedScopeItems.length} done
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {contractedScopeItems.map((value) => {
          const isDone = completed.has(value);
          return (
            <div key={value} className="flex items-center gap-3 px-4 py-2.5">
              {canEdit ? (
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => void toggle(value)}
                  disabled={saving}
                  className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 cursor-pointer disabled:opacity-50"
                />
              ) : (
                <span className={`h-4 w-4 flex-shrink-0 rounded border ${isDone ? "border-emerald-500 bg-emerald-100" : "border-gray-300 bg-white"}`} />
              )}
              <span className={`text-sm ${isDone ? "text-gray-400 line-through" : "text-gray-800"}`}>
                {turnoverScopeLabel(value)}
              </span>
              {isDone && <span className="ml-auto text-xs font-medium text-emerald-600">Done</span>}
            </div>
          );
        })}
      </div>
      {error ? <p className="px-4 py-2 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
