"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  projectId: string;
  jobTitle: string;
};

export function ProjectJobTitleEditor({ projectId, jobTitle }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(jobTitle);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!value.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobTitle: value.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <h1
        className="text-2xl font-semibold text-gray-900 cursor-pointer hover:text-gray-600"
        onClick={() => { setValue(jobTitle); setEditing(true); }}
        title="Click to edit"
      >
        {jobTitle}
      </h1>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-2">
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-lg font-semibold text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        style={{ minWidth: "20rem" }}
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
      {error ? <p className="w-full text-xs text-red-500">{error}</p> : null}
    </form>
  );
}
