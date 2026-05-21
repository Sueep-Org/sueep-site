"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOID";
  estimatedCostCents: number | null;
  estimatedDays: number | null;
  reason: string | null;
  resolutionNotes: string | null;
  laborers: ChangeOrderLaborer[];
};

export type ChangeOrderEmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
};

const STATUSES: ProjectChangeOrderRow["status"][] = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOID"];

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

export function ProjectChangeOrdersSection({
  projectId,
  initialEntries,
  employees,
}: {
  projectId: string;
  initialEntries: ProjectChangeOrderRow[];
  employees: ChangeOrderEmployeeOption[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newSupervisor, setNewSupervisor] = useState("");
  const [newLaborerIds, setNewLaborerIds] = useState<string[]>([]);

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
          supervisor: newSupervisor.trim() || undefined,
          status: String(fd.get("status") || "DRAFT"),
          description: String(fd.get("description") || "").trim() || undefined,
          reason: String(fd.get("reason") || "").trim() || undefined,
          estimatedCost: String(fd.get("estimatedCost") || "").trim() || undefined,
          estimatedDays: String(fd.get("estimatedDays") || "").trim() || undefined,
          resolutionNotes: String(fd.get("resolutionNotes") || "").trim() || undefined,
          laborers: newLaborerIds.map((eid) => {
            const emp = employees.find((e) => e.id === eid);
            return { employeeId: eid, name: emp ? `${emp.firstName} ${emp.lastName}`.trim() : eid };
          }),
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
      setNewSupervisor("");
      setNewLaborerIds([]);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/change-orders/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Failed to delete change order");
        return;
      }
      setEntries((prev) => prev.filter((row) => row.id !== id));
      router.refresh();
    } catch {
      setError("Network error");
    }
  }

  async function onSave(
    id: string,
    payload: {
      title: string;
      requestedBy: string;
      supervisor: string;
      status: ProjectChangeOrderRow["status"];
      description: string;
      reason: string;
      estimatedCost: string;
      estimatedDays: string;
      resolutionNotes: string;
      laborers: { employeeId: string | null; name: string }[];
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
          supervisor: payload.supervisor || null,
          status: payload.status,
          description: payload.description || null,
          reason: payload.reason || null,
          estimatedCost: payload.estimatedCost || null,
          estimatedDays: payload.estimatedDays || null,
          resolutionNotes: payload.resolutionNotes || null,
          laborers: payload.laborers,
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
                onDelete={onDelete}
                employees={employees}
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
          <div>
            <label className={label} htmlFor="co-supervisor">
              Supervisor / PM
            </label>
            <select
              id="co-supervisor"
              className={input}
              value={newSupervisor}
              onChange={(e) => setNewSupervisor(e.target.value)}
            >
              <option value="">— None —</option>
              {employees.map((e) => {
                const name = `${e.firstName} ${e.lastName}`.trim();
                return <option key={e.id} value={name}>{name}</option>;
              })}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label}>Laborers</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {employees.map((e) => {
                const name = `${e.firstName} ${e.lastName}`.trim();
                const checked = newLaborerIds.includes(e.id);
                return (
                  <label key={e.id} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="accent-pink-600"
                      checked={checked}
                      onChange={() =>
                        setNewLaborerIds((prev) =>
                          checked ? prev.filter((id) => id !== e.id) : [...prev, e.id],
                        )
                      }
                    />
                    {name}
                  </label>
                );
              })}
            </div>
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
};

function ChangeOrderEditor({
  row,
  projectId,
  saving,
  onSave,
  onDelete,
  employees,
}: {
  row: ProjectChangeOrderRow;
  projectId: string;
  saving: boolean;
  onSave: (
    id: string,
    payload: {
      title: string;
      requestedBy: string;
      supervisor: string;
      status: ProjectChangeOrderRow["status"];
      description: string;
      reason: string;
      estimatedCost: string;
      estimatedDays: string;
      resolutionNotes: string;
      laborers: { employeeId: string | null; name: string }[];
    },
  ) => void;
  onDelete: (id: string) => void;
  employees: ChangeOrderEmployeeOption[];
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [open, setOpen] = useState(false);
  const [notifyEmployeeId, setNotifyEmployeeId] = useState("");
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyResult, setNotifyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const notifiableEmployees = employees.filter((e) => e.email);
  const [title, setTitle] = useState(row.title);
  const [requestedBy, setRequestedBy] = useState(row.requestedBy || "");
  const [supervisor, setSupervisor] = useState(row.supervisor || "");
  const [status, setStatus] = useState<ProjectChangeOrderRow["status"]>(row.status);
  const [description, setDescription] = useState(row.description || "");
  const [reason, setReason] = useState(row.reason || "");
  const [estimatedCost, setEstimatedCost] = useState(
    row.estimatedCostCents != null ? (row.estimatedCostCents / 100).toFixed(2) : "",
  );
  const [estimatedDays, setEstimatedDays] = useState(row.estimatedDays != null ? String(row.estimatedDays) : "");
  const [resolutionNotes, setResolutionNotes] = useState(row.resolutionNotes || "");
  const [laborerIds, setLaborerIds] = useState<string[]>(
    row.laborers.flatMap((l) => (l.employeeId ? [l.employeeId] : [])),
  );

  useEffect(() => {
    setTitle(row.title);
    setRequestedBy(row.requestedBy || "");
    setSupervisor(row.supervisor || "");
    setStatus(row.status);
    setDescription(row.description || "");
    setReason(row.reason || "");
    setEstimatedCost(row.estimatedCostCents != null ? (row.estimatedCostCents / 100).toFixed(2) : "");
    setEstimatedDays(row.estimatedDays != null ? String(row.estimatedDays) : "");
    setResolutionNotes(row.resolutionNotes || "");
    setLaborerIds(row.laborers.flatMap((l) => (l.employeeId ? [l.employeeId] : [])));
  }, [row]);

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
          <p className="mb-3 text-xs text-gray-500">Created {new Date(row.createdAt).toLocaleString()}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <label className={label} htmlFor={`co-supervisor-${row.id}`}>
                Supervisor / PM
              </label>
              <select
                id={`co-supervisor-${row.id}`}
                className={input}
                value={supervisor}
                onChange={(e) => setSupervisor(e.target.value)}
              >
                <option value="">— None —</option>
                {employees.map((e) => {
                  const name = `${e.firstName} ${e.lastName}`.trim();
                  return <option key={e.id} value={name}>{name}</option>;
                })}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={label}>Laborers</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {employees.map((e) => {
                  const name = `${e.firstName} ${e.lastName}`.trim();
                  const checked = laborerIds.includes(e.id);
                  return (
                    <label key={e.id} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="accent-pink-600"
                        checked={checked}
                        onChange={() =>
                          setLaborerIds((prev) =>
                            checked ? prev.filter((id) => id !== e.id) : [...prev, e.id],
                          )
                        }
                      />
                      {name}
                    </label>
                  );
                })}
              </div>
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
                supervisor: supervisor.trim(),
                status,
                description: description.trim(),
                reason: reason.trim(),
                estimatedCost: estimatedCost.trim(),
                estimatedDays: estimatedDays.trim(),
                resolutionNotes: resolutionNotes.trim(),
                laborers: laborerIds.map((eid) => {
                  const emp = employees.find((e) => e.id === eid);
                  return { employeeId: eid, name: emp ? `${emp.firstName} ${emp.lastName}`.trim() : eid };
                }),
              })
            }
            className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
          {confirmDelete ? (
            <span className="mt-3 inline-flex items-center gap-2">
              <span className="text-sm text-gray-600">Delete this change order?</span>
              <button
                type="button"
                onClick={() => onDelete(row.id)}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mt-3 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}

          {/* Notify PM */}
          <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notify PM by email</p>
            {notifiableEmployees.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400">No employees with an email address on file.</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  value={notifyEmployeeId}
                  onChange={(e) => { setNotifyEmployeeId(e.target.value); setNotifyResult(null); }}
                >
                  <option value="">— Select PM —</option>
                  {notifiableEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {`${e.firstName} ${e.lastName}`.trim()} ({e.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!notifyEmployeeId || notifyLoading}
                  onClick={async () => {
                    setNotifyLoading(true);
                    setNotifyResult(null);
                    try {
                      const res = await fetch(
                        `/api/erp/projects/${projectId}/change-orders/${row.id}/notify`,
                        {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ employeeId: notifyEmployeeId }),
                        },
                      );
                      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; sentTo?: string; error?: string };
                      if (res.ok) {
                        setNotifyResult({ ok: true, msg: `Email sent to ${data.sentTo ?? "PM"}` });
                        setNotifyEmployeeId("");
                      } else {
                        setNotifyResult({ ok: false, msg: data.error || "Failed to send email" });
                      }
                    } catch {
                      setNotifyResult({ ok: false, msg: "Network error" });
                    } finally {
                      setNotifyLoading(false);
                    }
                  }}
                  className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                >
                  {notifyLoading ? "Sending…" : "Send notification"}
                </button>
                {notifyResult && (
                  <span className={`text-xs ${notifyResult.ok ? "text-green-600" : "text-red-500"}`}>
                    {notifyResult.msg}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}