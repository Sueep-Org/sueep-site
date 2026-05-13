"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SERVICE_TYPE_OPTIONS } from "@/lib/erp/serviceTypes";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

type Props = { projectId: string; description: string | null };

export function ProjectServiceTypeEditor({ projectId, description }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isKnown = description ? (SERVICE_TYPE_OPTIONS as readonly string[]).includes(description) : false;
  const [selected, setSelected] = useState(description && isKnown ? description : description ? "__other__" : "");
  const [custom, setCustom] = useState(description && !isKnown ? description : "");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const value = selected === "__other__" ? custom.trim() : selected;
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: value || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Work Type</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="st-select">
            Type
          </label>
          <select
            id="st-select"
            className={inputCls}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">— None —</option>
            {SERVICE_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            <option value="__other__">Other…</option>
          </select>
        </div>
        {selected === "__other__" && (
          <div>
            <label className={labelCls} htmlFor="st-custom">
              Custom
            </label>
            <input
              id="st-custom"
              type="text"
              className={inputCls}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Describe the work"
            />
          </div>
        )}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
