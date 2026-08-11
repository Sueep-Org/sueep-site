"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, labelClass } from "@/app/erp/components/ui";

const input = inputClass.md;
const label = labelClass.default;

type EmployeeNotifyOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

/** Non-financial subset of a change order. This component never receives
 * (or sends to the browser) cost fields, so there's nothing to accidentally
 * expose in the UI or in the network payload. */
export type SupervisorChangeOrderRow = {
  id: string;
  createdAt: string;
  title: string;
  description: string | null;
  requestedBy: string | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID" | "BILLING" | "COMPLETED";
};

const STATUS_COLORS: Record<SupervisorChangeOrderRow["status"], string> = {
  DRAFT: "bg-gray-200 text-gray-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  VOID: "bg-amber-100 text-amber-700",
  BILLING: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

/** Finds the standing "notify on a new CO" recipients (Sergio, Nick, David
 * Rodriguez), same matching rule as the PM-facing change order form's
 * default selection, so supervisors always reach the same people without
 * being handed a full employee picker (they don't need one, and it'd be one
 * more place to accidentally expose the employee list/financials). */
function resolveDefaultNotifyIds(employees: EmployeeNotifyOption[]): string[] {
  const ids: string[] = [];
  for (const e of employees) {
    if (!e.email) continue;
    const name = `${e.firstName} ${e.lastName}`.toLowerCase();
    if (name === "david rodriguez" || e.firstName.toLowerCase() === "sergio" || e.firstName.toLowerCase() === "nick") {
      ids.push(e.id);
    }
  }
  return ids;
}

export function SupervisorChangeOrderRequestForm({
  projectId,
  defaultRequestedBy,
  employees = [],
  initialEntries,
}: {
  projectId: string;
  defaultRequestedBy?: string;
  employees?: EmployeeNotifyOption[];
  initialEntries: SupervisorChangeOrderRow[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notifyResult, setNotifyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const notifyIds = resolveDefaultNotifyIds(employees);
  const notifyNames = employees
    .filter((e) => notifyIds.includes(e.id))
    .map((e) => `${e.firstName} ${e.lastName}`.trim())
    .join(", ");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    setNotifyResult(null);
    setLoading(true);
    const fd = new FormData(form);

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(fd.get("title") || "").trim(),
          requestedBy: String(fd.get("requestedBy") || "").trim() || undefined,
          description: String(fd.get("description") || "").trim() || undefined,
          status: "SUBMITTED",
        }),
      });
      const data = (await res.json()) as SupervisorChangeOrderRow & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to request change order");
        setLoading(false);
        return;
      }
      setEntries((prev) => [data, ...prev]);
      form.reset();

      if (notifyIds.length > 0) {
        try {
          const notifyRes = await fetch(
            `/api/erp/projects/${projectId}/change-orders/${data.id}/notify`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ employeeIds: notifyIds }),
            },
          );
          if (notifyRes.ok) {
            setNotifyResult({ ok: true, msg: `Request sent. Notified: ${notifyNames}` });
          } else {
            setNotifyResult({ ok: false, msg: "Request created, but notification failed" });
          }
        } catch {
          setNotifyResult({ ok: false, msg: "Request created, but notification failed" });
        }
      } else {
        setNotifyResult({ ok: true, msg: "Request sent." });
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Request a change order</h2>
        <p className="mt-1 text-xs text-gray-500">
          Describe the extra work needed. This notifies {notifyNames || "the office"} to review and price it.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="co-title">
              Title *
            </label>
            <input id="co-title" name="title" required className={input} placeholder="Add two extra prep coats in lobby" />
          </div>
          <div>
            <label className={label} htmlFor="co-requestedBy">
              Requested by
            </label>
            <input id="co-requestedBy" name="requestedBy" defaultValue={defaultRequestedBy ?? ""} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="co-description">
              Comments
            </label>
            <textarea id="co-description" name="description" rows={3} className={input} placeholder="What's needed and why" />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {notifyResult ? (
          <p className={`mt-2 text-xs ${notifyResult.ok ? "text-green-600" : "text-red-500"}`} role="status">
            {notifyResult.msg}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Sending…" : "Request change order"}
        </button>
      </form>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your requests</h2>
        <div className="mt-3 space-y-2">
          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              No change order requests yet.
            </p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-gray-900" title={entry.title}>
                    {entry.title}
                  </span>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_COLORS[entry.status]}`}>
                    {entry.status}
                  </span>
                </div>
                {entry.description ? <p className="mt-1 text-xs text-gray-500">{entry.description}</p> : null}
                <p className="mt-1 text-[11px] text-gray-400">
                  {new Date(entry.createdAt).toLocaleDateString()}
                  {entry.requestedBy ? ` · ${entry.requestedBy}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
