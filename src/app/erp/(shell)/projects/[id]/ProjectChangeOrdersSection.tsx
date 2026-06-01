"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { centsToDollars } from "@/lib/erp/money";

export type ChangeOrderLaborer = {
  id: string;
  employeeId: string | null;
  name: string;
  role: string | null;
};

export type ProjectChangeOrderRow = {
  id: string;
  createdAt: string;
  title: string;
  description: string | null;
  requestedBy: string | null;
  supervisor: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING";
  estimatedCostCents: number | null;
  estimatedDays: number | null;
  reason: string | null;
  resolutionNotes: string | null;
  laborers: ChangeOrderLaborer[];
};


const STATUSES: ProjectChangeOrderRow["status"][] = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOID", "BILLING"];


const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

export function ProjectChangeOrdersSection({
  projectId,
  initialEntries,
}: {
  projectId: string;
  initialEntries: ProjectChangeOrderRow[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    setLoading(true);
    const fd = new FormData(form);

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(fd.get("title") || "").trim(),
          requestedBy: String(fd.get("requestedBy") || "").trim() || undefined,
          status: String(fd.get("status") || "DRAFT"),
          description: String(fd.get("description") || "").trim() || undefined,
        }),
      });
      const data = (await res.json()) as ProjectChangeOrderRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to create change order");
        setLoading(false);
        return;
      }
      setEntries((prev) => [data, ...prev]);
      form.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onSave(id: string, status: ProjectChangeOrderRow["status"]) {
    setSavingId(id);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as ProjectChangeOrderRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to update change order");
        setSavingId(null);
        return;
      }
      setEntries((prev) => prev.map((row) => (row.id === id ? data : row)));
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Change orders</h2>
        <div className="mt-4 space-y-3">
          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              No change orders yet.
            </p>
          ) : (
            entries.map((entry) => (
              <ChangeOrderEditor
                key={entry.id}
                row={entry}
                projectId={projectId}
                saving={savingId === entry.id}
                onSave={onSave}
              />
            ))
          )}
        </div>
      </div>

      <form onSubmit={onAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Start change order</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="co-title">
              Title *
            </label>
            <input id="co-title" name="title" required className={input} placeholder="Add two extra prep coats in lobby" />
          </div>
          <div>
            <label className={label} htmlFor="co-status">
              Status
            </label>
            <select id="co-status" name="status" defaultValue="DRAFT" className={input}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="co-requestedBy">
              Requested by
            </label>
            <input id="co-requestedBy" name="requestedBy" className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="co-description">
              Comments
            </label>
            <textarea id="co-description" name="description" rows={3} className={input} />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Create change order"}
        </button>
      </form>
    </div>
  );
}

const STATUS_COLORS: Record<ProjectChangeOrderRow["status"], string> = {
  DRAFT: "bg-gray-200 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  VOID: "bg-amber-100 text-amber-700",
  BILLING: "bg-emerald-100 text-emerald-700",
};

function ChangeOrderEditor({
  row,
  projectId,
  saving,
  onSave,
}: {
  row: ProjectChangeOrderRow;
  projectId: string;
  saving: boolean;
  onSave: (id: string, status: ProjectChangeOrderRow["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectChangeOrderRow["status"]>(row.status);

  useEffect(() => {
    setStatus(row.status);
  }, [row.status]);

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_COLORS[row.status]}`}>
            {row.status}
          </span>
          <span className="truncate text-sm font-medium text-gray-900">{row.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="text-xs text-gray-500">
            {centsToDollars(row.estimatedCostCents)} &middot; {row.estimatedDays ?? 0}d
          </span>
          <Link
            href={`/erp/projects/${projectId}/change-orders/${row.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium text-pink-600 hover:underline"
          >
            View details
          </Link>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={label} htmlFor={`co-status-${row.id}`}>Status</label>
              <select
                id={`co-status-${row.id}`}
                className={input}
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectChangeOrderRow["status"])}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={saving || status === row.status}
              onClick={() => onSave(row.id, status)}
              className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}