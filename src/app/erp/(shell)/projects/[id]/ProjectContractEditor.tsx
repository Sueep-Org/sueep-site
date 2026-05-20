"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

type Props = {
  projectId: string;
  contractValueCents: number | null;
};

export function ProjectContractEditor({ projectId, contractValueCents }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(
    contractValueCents != null ? (contractValueCents / 100).toFixed(2) : "",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contractValue: value === "" ? null : Number(value) }),
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
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contract value</h2>
      <p className="mt-1 text-xs text-gray-400">
        Manually set or override the contract amount. Change orders added to this project will
        automatically increment this value.
      </p>
      <div className="mt-4 max-w-xs">
        <label className={labelCls} htmlFor="contract-value">
          Amount ($)
        </label>
        <input
          id="contract-value"
          type="number"
          min={0}
          step={0.01}
          className={inputCls}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0.00"
        />
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
