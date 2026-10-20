"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";

type DealCandidate = { id: string; name: string; closedLost: boolean };

export function LinkHubSpotDealButton({ projectId, jobTitle }: { projectId: string; jobTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(jobTitle);
  const [candidates, setCandidates] = useState<DealCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [dealId, setDealId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflictProjectId, setConflictProjectId] = useState<string | null>(null);

  async function search(q: string) {
    setSearching(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/hubspot-deal?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: DealCandidate[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Could not search HubSpot.");
        return;
      }
      setCandidates(data.results ?? []);
    } catch {
      setError("Network error searching HubSpot.");
    } finally {
      setSearching(false);
      setSearched(true);
    }
  }

  function openModal() {
    setOpen(true);
    setError("");
    setConflictProjectId(null);
    setDealId("");
    if (!searched) void search(query);
  }

  async function link() {
    setSaving(true);
    setError("");
    setConflictProjectId(null);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/hubspot-deal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; projectId?: string };
      if (!res.ok) {
        setError(data.error || "Could not link the deal.");
        setConflictProjectId(data.projectId ?? null);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openModal} className="text-xs font-medium text-pink-600 hover:text-pink-700">
        Link HubSpot deal
      </button>
      <Modal open={open} onClose={() => setOpen(false)} size="md">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold text-gray-900">Link HubSpot deal</h2>
          <InfoTip text="After linking, this project syncs like any HubSpot project: invoices, paid dates, contacts and deal stage. A deal can only be linked to one project. Closed lost deals can't be linked." />
        </div>

        <label className={`${labelClass.default} mt-3`} htmlFor="link-deal-search">Search deals</label>
        <div className="flex gap-2">
          <input
            id="link-deal-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search(query);
              }
            }}
            placeholder="Deal name"
            className={inputClass.md}
          />
          <button
            type="button"
            onClick={() => search(query)}
            disabled={searching || !query.trim()}
            className="mt-1 shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {searched && !searching && candidates.length === 0 && !error && (
          <p className="mt-1 text-xs text-gray-400">No matching deals. Try another name or paste the deal ID below.</p>
        )}

        {candidates.length > 0 && (
          <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-1.5">
            {candidates.map((deal) => (
              <button
                key={deal.id}
                type="button"
                disabled={deal.closedLost}
                onClick={() => setDealId(deal.id)}
                className={`flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                  dealId === deal.id ? "bg-pink-50 font-medium text-pink-700" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="truncate" title={deal.name}>{deal.name}</span>
                {deal.closedLost ? (
                  <span className="shrink-0 text-gray-400">Closed lost</span>
                ) : (
                  dealId === deal.id && <span className="shrink-0 text-pink-600">Selected</span>
                )}
              </button>
            ))}
          </div>
        )}

        <label className={`${labelClass.default} mt-3`} htmlFor="link-deal-id">Deal ID or link</label>
        <input
          id="link-deal-id"
          value={dealId}
          onChange={(e) => setDealId(e.target.value)}
          placeholder="e.g. 12345678901"
          className={inputClass.md}
        />

        {error && (
          <p className="mt-2 text-xs text-red-600">
            {error}
            {conflictProjectId && (
              <>
                {" "}
                <Link href={`/erp/projects/${conflictProjectId}`} className="underline">Open it</Link>
              </>
            )}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <Button size="xs" type="button" onClick={link} disabled={saving || !dealId.trim()}>
            {saving ? "Linking..." : "Link deal"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
