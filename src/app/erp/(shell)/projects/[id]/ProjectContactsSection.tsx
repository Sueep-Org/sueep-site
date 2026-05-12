"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type ProjectContactRow = {
  id: string;
  createdAt: string;
  fullName: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source: string;
  isPrimary: boolean;
};

export function ProjectContactsSection({
  projectId,
  hubspotDealId,
  initialEntries,
}: {
  projectId: string;
  hubspotDealId: string | null;
  initialEntries: ProjectContactRow[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  async function onSync() {
    if (!hubspotDealId) {
      setError("This project is not linked to a HubSpot deal yet.");
      return;
    }
    setError("");
    setSyncing(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/contacts/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const data = (await res.json()) as { contacts?: ProjectContactRow[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to sync contacts");
        return;
      }
      setEntries(data.contacts || []);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Project contacts</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Contacts are synced from the linked HubSpot deal associations.
            </p>
          </div>
          <button
            type="button"
            disabled={syncing || !hubspotDealId}
            onClick={onSync}
            className="rounded-md bg-pink-600 px-3 py-2 text-xs font-medium text-white hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync from HubSpot"}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">
              No contacts synced yet.
            </p>
          ) : (
            entries.map((entry) => <ProjectContactCard key={entry.id} row={entry} />)
          )}
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ProjectContactCard({ row }: { row: ProjectContactRow }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">
            {row.fullName}
            {row.isPrimary ? <span className="ml-2 rounded-full bg-pink-500/20 px-2 py-0.5 text-[10px] text-pink-300">Primary</span> : null}
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            {[row.role, row.company].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">{row.source}</p>
      </div>
      {row.notes ? <p className="mt-2 text-sm text-zinc-400">{row.notes}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {row.email ? (
          <a href={`mailto:${row.email}`} className="text-pink-400 hover:underline">
            {row.email}
          </a>
        ) : (
          <span className="text-zinc-500">No email</span>
        )}
        {row.phone ? (
          <a href={`tel:${row.phone}`} className="text-pink-400 hover:underline">
            {row.phone}
          </a>
        ) : (
          <span className="text-zinc-500">No phone</span>
        )}
        <div className="text-xs text-zinc-500">
          Synced {new Date(row.createdAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
}