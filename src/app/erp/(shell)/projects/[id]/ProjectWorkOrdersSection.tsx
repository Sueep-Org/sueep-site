"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type WorkOrderRow = {
  id: string;
  createdAt: string;
  title: string;
  location: string | null;
  requestedBy: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: string | null;
  scopeDetails: string | null;
  specifications: string | null;
  supportInfo: string | null;
  photoUrls: string[];
};

const input =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-400";

function normalizePhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeWorkOrder(data: Record<string, unknown>): WorkOrderRow {
  return {
    id: String(data.id || ""),
    createdAt: String(data.createdAt || new Date().toISOString()),
    title: String(data.title || ""),
    location: data.location ? String(data.location) : null,
    requestedBy: data.requestedBy ? String(data.requestedBy) : null,
    priority: (String(data.priority || "MEDIUM").toUpperCase() as WorkOrderRow["priority"]) || "MEDIUM",
    dueDate: data.dueDate ? String(data.dueDate) : null,
    scopeDetails: data.scopeDetails ? String(data.scopeDetails) : null,
    specifications: data.specifications ? String(data.specifications) : null,
    supportInfo: data.supportInfo ? String(data.supportInfo) : null,
    photoUrls: normalizePhotoUrls(data.photoUrls),
  };
}

const priorityTone: Record<WorkOrderRow["priority"], string> = {
  LOW: "text-zinc-300",
  MEDIUM: "text-blue-300",
  HIGH: "text-amber-300",
  URGENT: "text-red-300",
};

export function ProjectWorkOrdersSection({
  projectId,
  initialEntries,
}: {
  projectId: string;
  initialEntries: WorkOrderRow[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  async function onAddWorkOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const photoUrls = String(fd.get("photoUrls") || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/work-orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(fd.get("title") || "").trim(),
          location: String(fd.get("location") || "").trim() || undefined,
          requestedBy: String(fd.get("requestedBy") || "").trim() || undefined,
          priority: String(fd.get("priority") || "MEDIUM"),
          dueDate: String(fd.get("dueDate") || "").trim() || undefined,
          scopeDetails: String(fd.get("scopeDetails") || "").trim() || undefined,
          specifications: String(fd.get("specifications") || "").trim() || undefined,
          supportInfo: String(fd.get("supportInfo") || "").trim() || undefined,
          photoUrls,
        }),
      });
      const data = (await res.json()) as Record<string, unknown> & { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to create work order");
        setLoading(false);
        return;
      }
      const normalized = normalizeWorkOrder(data);
      setEntries((prev) => [normalized, ...prev]);
      form.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Work orders</h2>
          <p className="text-sm text-zinc-400">{entries.length} total</p>
        </div>
        <div className="mt-4 space-y-3">
          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              No work orders yet. Add one below with scope, specs, and photos for your project manager.
            </p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">{entry.title}</p>
                    <p className="text-xs text-zinc-500">Created {new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${priorityTone[entry.priority]}`}>
                    {entry.priority}
                  </p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <p className="text-sm text-zinc-300">
                    <span className="text-zinc-500">Location:</span> {entry.location || "—"}
                  </p>
                  <p className="text-sm text-zinc-300">
                    <span className="text-zinc-500">Requested by:</span> {entry.requestedBy || "—"}
                  </p>
                  <p className="text-sm text-zinc-300">
                    <span className="text-zinc-500">Due date:</span>{" "}
                    {entry.dueDate ? new Date(entry.dueDate).toLocaleDateString() : "—"}
                  </p>
                </div>

                {entry.scopeDetails ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">
                    <span className="text-zinc-500">Details:</span> {entry.scopeDetails}
                  </p>
                ) : null}
                {entry.specifications ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">
                    <span className="text-zinc-500">Specs:</span> {entry.specifications}
                  </p>
                ) : null}
                {entry.supportInfo ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">
                    <span className="text-zinc-500">Extra info:</span> {entry.supportInfo}
                  </p>
                ) : null}

                {entry.photoUrls.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Photographs</p>
                    <ul className="mt-1 space-y-1">
                      {entry.photoUrls.map((url) => (
                        <li key={url}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-pink-400 hover:text-pink-300 hover:underline"
                          >
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

              </div>
            ))
          )}
        </div>
      </div>

      <form onSubmit={onAddWorkOrder} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Add work order</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={label} htmlFor="wo-title">
              Work order title *
            </label>
            <input id="wo-title" name="title" required className={input} placeholder="Deep clean Building B level 4" />
          </div>
          <div>
            <label className={label} htmlFor="wo-priority">
              Priority
            </label>
            <select id="wo-priority" name="priority" defaultValue="MEDIUM" className={input}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="wo-location">
              Location / area
            </label>
            <input id="wo-location" name="location" className={input} placeholder="Tower 2, 7th floor" />
          </div>
          <div>
            <label className={label} htmlFor="wo-requestedBy">
              Requested by
            </label>
            <input id="wo-requestedBy" name="requestedBy" className={input} placeholder="Client or foreman" />
          </div>
          <div>
            <label className={label} htmlFor="wo-dueDate">
              Due date
            </label>
            <input id="wo-dueDate" name="dueDate" type="date" className={input} />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="wo-details">
              Scope details
            </label>
            <textarea
              id="wo-details"
              name="scopeDetails"
              rows={3}
              className={input}
              placeholder="What has to be done, access instructions, site notes..."
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="wo-specs">
              Specifications
            </label>
            <textarea
              id="wo-specs"
              name="specifications"
              rows={3}
              className={input}
              placeholder="Materials, finish standards, tolerances, required products..."
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="wo-photoUrls">
              Photograph URLs (one per line)
            </label>
            <textarea
              id="wo-photoUrls"
              name="photoUrls"
              rows={3}
              className={input}
              placeholder="https://.../before.jpg&#10;https://.../after.jpg"
            />
          </div>

          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="wo-supportInfo">
              Additional information
            </label>
            <textarea
              id="wo-supportInfo"
              name="supportInfo"
              rows={2}
              className={input}
              placeholder="Anything else that helps PM and field team stay aligned."
            />
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
          {loading ? "Saving…" : "Save work order"}
        </button>
      </form>
    </div>
  );
}