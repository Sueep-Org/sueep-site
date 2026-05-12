"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars } from "@/lib/erp/money";

export type ProjectChangeOrderRow = {
  id: string;
  createdAt: string;
  title: string;
  description: string | null;
  requestedBy: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID";
  estimatedCostCents: number | null;
  estimatedDays: number | null;
  reason: string | null;
  resolutionNotes: string | null;
};

const STATUSES: ProjectChangeOrderRow["status"][] = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOID"];

const input =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-400";

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
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(fd.get("title") || "").trim(),
          requestedBy: String(fd.get("requestedBy") || "").trim() || undefined,
          status: String(fd.get("status") || "DRAFT"),
          description: String(fd.get("description") || "").trim() || undefined,
          reason: String(fd.get("reason") || "").trim() || undefined,
          estimatedCost: String(fd.get("estimatedCost") || "").trim() || undefined,
          estimatedDays: String(fd.get("estimatedDays") || "").trim() || undefined,
          resolutionNotes: String(fd.get("resolutionNotes") || "").trim() || undefined,
        }),
      });
      const data = (await res.json()) as ProjectChangeOrderRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to create change order");
        setLoading(false);
        return;
      }
      setEntries((prev) => [data, ...prev]);
      e.currentTarget.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onSave(
    id: string,
    payload: {
      title: string;
      requestedBy: string;
      status: ProjectChangeOrderRow["status"];
      description: string;
      reason: string;
      estimatedCost: string;
      estimatedDays: string;
      resolutionNotes: string;
    },
  ) {
    setSavingId(id);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          requestedBy: payload.requestedBy || null,
          status: payload.status,
          description: payload.description || null,
          reason: payload.reason || null,
          estimatedCost: payload.estimatedCost || null,
          estimatedDays: payload.estimatedDays || null,
          resolutionNotes: payload.resolutionNotes || null,
        }),
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
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Change orders</h2>
        <div className="mt-4 space-y-3">
          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              No change orders yet.
            </p>
          ) : (
            entries.map((entry) => (
              <ChangeOrderEditor
                key={entry.id}
                row={entry}
                saving={savingId === entry.id}
                onSave={onSave}
              />
            ))
          )}
        </div>
      </div>

      <form onSubmit={onAdd} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Start change order</h2>
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
          <div>
            <label className={label} htmlFor="co-estimatedCost">
              Estimated cost (USD)
            </label>
            <input id="co-estimatedCost" name="estimatedCost" className={input} placeholder="1250.00" />
          </div>
          <div>
            <label className={label} htmlFor="co-estimatedDays">
              Schedule impact (days)
            </label>
            <input id="co-estimatedDays" name="estimatedDays" type="number" min={0} step={1} className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="co-description">
              Description
            </label>
            <textarea id="co-description" name="description" rows={2} className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="co-reason">
              Reason
            </label>
            <textarea id="co-reason" name="reason" rows={2} className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="co-resolutionNotes">
              Resolution notes
            </label>
            <textarea id="co-resolutionNotes" name="resolutionNotes" rows={2} className={input} />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
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

function ChangeOrderEditor({
  row,
  saving,
  onSave,
}: {
  row: ProjectChangeOrderRow;
  saving: boolean;
  onSave: (
    id: string,
    payload: {
      title: string;
      requestedBy: string;
      status: ProjectChangeOrderRow["status"];
      description: string;
      reason: string;
      estimatedCost: string;
      estimatedDays: string;
      resolutionNotes: string;
    },
  ) => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [requestedBy, setRequestedBy] = useState(row.requestedBy || "");
  const [status, setStatus] = useState<ProjectChangeOrderRow["status"]>(row.status);
  const [description, setDescription] = useState(row.description || "");
  const [reason, setReason] = useState(row.reason || "");
  const [estimatedCost, setEstimatedCost] = useState(
    row.estimatedCostCents != null ? (row.estimatedCostCents / 100).toFixed(2) : "",
  );
  const [estimatedDays, setEstimatedDays] = useState(row.estimatedDays != null ? String(row.estimatedDays) : "");
  const [resolutionNotes, setResolutionNotes] = useState(row.resolutionNotes || "");

  useEffect(() => {
    setTitle(row.title);
    setRequestedBy(row.requestedBy || "");
    setStatus(row.status);
    setDescription(row.description || "");
    setReason(row.reason || "");
    setEstimatedCost(row.estimatedCostCents != null ? (row.estimatedCostCents / 100).toFixed(2) : "");
    setEstimatedDays(row.estimatedDays != null ? String(row.estimatedDays) : "");
    setResolutionNotes(row.resolutionNotes || "");
  }, [row]);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs text-zinc-500">Created {new Date(row.createdAt).toLocaleString()}</p>
        <p className="text-sm text-zinc-300">
          Current impact: {centsToDollars(row.estimatedCostCents)} and {row.estimatedDays ?? 0} day(s)
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={label} htmlFor={`co-title-${row.id}`}>
            Title
          </label>
          <input id={`co-title-${row.id}`} className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor={`co-status-${row.id}`}>
            Status
          </label>
          <select
            id={`co-status-${row.id}`}
            className={input}
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectChangeOrderRow["status"])}
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor={`co-requested-${row.id}`}>
            Requested by
          </label>
          <input
            id={`co-requested-${row.id}`}
            className={input}
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor={`co-cost-${row.id}`}>
            Estimated cost (USD)
          </label>
          <input
            id={`co-cost-${row.id}`}
            className={input}
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(e.target.value)}
          />
        </div>
        <div>
          <label className={label} htmlFor={`co-days-${row.id}`}>
            Schedule impact (days)
          </label>
          <input
            id={`co-days-${row.id}`}
            type="number"
            min={0}
            step={1}
            className={input}
            value={estimatedDays}
            onChange={(e) => setEstimatedDays(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={label} htmlFor={`co-description-${row.id}`}>
            Description
          </label>
          <textarea
            id={`co-description-${row.id}`}
            rows={2}
            className={input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={label} htmlFor={`co-reason-${row.id}`}>
            Reason
          </label>
          <textarea
            id={`co-reason-${row.id}`}
            rows={2}
            className={input}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={label} htmlFor={`co-resolution-${row.id}`}>
            Resolution notes
          </label>
          <textarea
            id={`co-resolution-${row.id}`}
            rows={2}
            className={input}
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
          />
        </div>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() =>
          onSave(row.id, {
            title: title.trim(),
            requestedBy: requestedBy.trim(),
            status,
            description: description.trim(),
            reason: reason.trim(),
            estimatedCost: estimatedCost.trim(),
            estimatedDays: estimatedDays.trim(),
            resolutionNotes: resolutionNotes.trim(),
          })
        }
        className="mt-3 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save changes"}
      </button>
    </div>
  );
}