"use client";

import { useState } from "react";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

export function EmployeeSsnSection({ employeeId, hasSsn }: { employeeId: string; hasSsn: boolean }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedHasSsn, setSavedHasSsn] = useState(hasSsn);

  async function handleReveal() {
    setRevealError("");
    setRevealing(true);
    try {
      const res = await fetch(`/api/erp/employees/${employeeId}/ssn`);
      const data = (await res.json()) as { ssn?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRevealed(data.ssn ?? "");
    } catch (err) {
      setRevealError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setRevealing(false);
    }
  }

  function handleHide() {
    setRevealed(null);
  }

  function startEdit() {
    setEditValue(revealed ?? "");
    setEditing(true);
    setSaveError("");
  }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/erp/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ssn: editValue.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Update failed");
      setSavedHasSsn(editValue.trim() !== "");
      setRevealed(editValue.trim() || null);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-sm font-semibold text-gray-800">Social Security Number</h2>

      <div className="mt-4">
        <label className={label}>SSN</label>
        {editing ? (
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              className={input}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="XXX-XX-XXXX"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 rounded-md bg-pink-600 px-3 py-2 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-800">
              {revealed != null ? (revealed || "—") : savedHasSsn ? "***-**-****" : "Not set"}
            </div>
            {savedHasSsn && revealed == null && (
              <button
                type="button"
                onClick={handleReveal}
                disabled={revealing}
                className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                {revealing ? "Loading…" : "Reveal"}
              </button>
            )}
            {revealed != null && (
              <button
                type="button"
                onClick={handleHide}
                className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                Hide
              </button>
            )}
            <button
              type="button"
              onClick={startEdit}
              className="shrink-0 text-xs font-medium text-pink-600 hover:text-pink-800"
            >
              {savedHasSsn ? "Edit" : "Add"}
            </button>
          </div>
        )}
        {revealError ? <p className="mt-1.5 text-xs text-red-500">{revealError}</p> : null}
        {saveError ? <p className="mt-1.5 text-xs text-red-500">{saveError}</p> : null}
      </div>
    </section>
  );
}
