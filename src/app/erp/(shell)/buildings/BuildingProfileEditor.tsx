"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "../../components/SearchableSelect";

type DealCandidate = { id: string; name: string };

interface BuildingProfileEditorProps {
  buildingId: string;
  initial: {
    name: string;
    builder: string | null;
    address: string;
    pmName: string | null;
    pmEmail: string | null;
    pmPhone: string | null;
    hubspotDealId?: string | null;
  };
  commissionEmployeeId?: string | null;
  employees?: { id: string; name: string }[];
  canEditCommissionOwner?: boolean;
}

export function BuildingProfileEditor({ buildingId, initial, commissionEmployeeId = null, employees = [], canEditCommissionOwner = false }: BuildingProfileEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [builder, setBuilder] = useState(initial.builder ?? "");
  const [address, setAddress] = useState(initial.address);
  const [pmName, setPmName] = useState(initial.pmName ?? "");
  const [pmEmail, setPmEmail] = useState(initial.pmEmail ?? "");
  const [pmPhone, setPmPhone] = useState(initial.pmPhone ?? "");
  const [hubspotDealId, setHubspotDealId] = useState(initial.hubspotDealId ?? "");
  const [commissionOwner, setCommissionOwner] = useState(commissionEmployeeId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [dealQuery, setDealQuery] = useState(initial.name);
  const [dealCandidates, setDealCandidates] = useState<DealCandidate[]>([]);
  const [dealSearchLoading, setDealSearchLoading] = useState(false);
  const [dealSearchError, setDealSearchError] = useState("");
  const [hasSearchedDeal, setHasSearchedDeal] = useState(false);

  async function searchForDeal(query: string) {
    setDealSearchLoading(true);
    setDealSearchError("");
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}/hubspot-deal-search?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { results?: DealCandidate[]; error?: string };
      if (!res.ok) {
        setDealSearchError(data.error || "Could not search HubSpot.");
        return;
      }
      setDealCandidates(data.results ?? []);
    } catch {
      setDealSearchError("Network error searching HubSpot.");
    } finally {
      setDealSearchLoading(false);
      setHasSearchedDeal(true);
    }
  }

  // Auto-search once on load, but only if this building isn't already linked
  // — otherwise every visit to the Details tab would re-search unprompted.
  useEffect(() => {
    if (!initial.hubspotDealId) {
      void searchForDeal(dealQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [ownerSuggestion, setOwnerSuggestion] = useState<{ ownerName: string | null; matchedEmployeeId: string | null; matchedEmployeeName: string | null } | null>(null);
  const [ownerSuggestLoading, setOwnerSuggestLoading] = useState(false);
  const [ownerSuggestError, setOwnerSuggestError] = useState("");

  async function suggestCommissionOwner(dealId: string) {
    setOwnerSuggestLoading(true);
    setOwnerSuggestError("");
    setOwnerSuggestion(null);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}/hubspot-deal-owner?dealId=${encodeURIComponent(dealId)}`);
      const data = (await res.json()) as { ownerName?: string | null; matchedEmployeeId?: string | null; matchedEmployeeName?: string | null; error?: string };
      if (!res.ok) {
        setOwnerSuggestError(data.error || "Could not check the HubSpot deal owner.");
        return;
      }
      setOwnerSuggestion({ ownerName: data.ownerName ?? null, matchedEmployeeId: data.matchedEmployeeId ?? null, matchedEmployeeName: data.matchedEmployeeName ?? null });
      if (data.matchedEmployeeId) setCommissionOwner(data.matchedEmployeeId);
    } catch {
      setOwnerSuggestError("Network error checking the HubSpot deal owner.");
    } finally {
      setOwnerSuggestLoading(false);
    }
  }

  // Whenever a deal gets linked (via search or manual entry), auto-fill the
  // commission owner from that deal's HubSpot owner — only when no owner is
  // set yet, so it never clobbers an explicit manual assignment.
  useEffect(() => {
    if (canEditCommissionOwner && hubspotDealId && !commissionOwner) {
      void suggestCommissionOwner(hubspotDealId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubspotDealId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const payload: Record<string, unknown> = {
      name,
      builder: builder || null,
      address,
      pmName: pmName || null,
      pmEmail: pmEmail || null,
      pmPhone: pmPhone || null,
      hubspotDealId: hubspotDealId || null,
    };
    if (canEditCommissionOwner) {
      payload.commissionEmployeeId = commissionOwner || null;
    }

    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update building");
        setLoading(false);
        return;
      }
      setSuccess("Saved successfully.");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Delete this building? This action cannot be undone.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete building");
        setLoading(false);
        return;
      }
      router.push("/erp/buildings");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600">Building name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Address *</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Builder</label>
          <input
            value={builder}
            onChange={(e) => setBuilder(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Property manager name</label>
          <input
            value={pmName}
            onChange={(e) => setPmName(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">Property manager email</label>
          <input
            value={pmEmail}
            onChange={(e) => setPmEmail(e.target.value)}
            type="email"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600">Property manager phone</label>
          <input
            value={pmPhone}
            onChange={(e) => setPmPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600">HubSpot deal (for turnover invoicing)</label>
          <div className="mt-1 flex gap-2">
            <input
              value={dealQuery}
              onChange={(e) => setDealQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchForDeal(dealQuery);
                }
              }}
              placeholder="Search HubSpot deals by name…"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            />
            <button
              type="button"
              onClick={() => searchForDeal(dealQuery)}
              disabled={dealSearchLoading || !dealQuery.trim()}
              className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {dealSearchLoading ? "Searching…" : "Search"}
            </button>
          </div>

          {dealSearchError && <p className="mt-1 text-xs text-red-600">{dealSearchError}</p>}

          {hasSearchedDeal && !dealSearchLoading && dealCandidates.length === 0 && !dealSearchError && (
            <p className="mt-1 text-xs text-gray-400">No matching deals found for &quot;{dealQuery}&quot; — try a different search term, or enter the deal ID manually below.</p>
          )}

          {dealCandidates.length > 0 && (
            <div className="mt-1.5 space-y-1 rounded-md border border-gray-200 p-1.5">
              {dealCandidates.map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => setHubspotDealId(deal.id)}
                  className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs ${
                    hubspotDealId === deal.id ? "bg-pink-50 font-medium text-pink-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="truncate">{deal.name}</span>
                  {hubspotDealId === deal.id && <span className="shrink-0 text-pink-600">✓ Selected</span>}
                </button>
              ))}
            </div>
          )}

          <input
            value={hubspotDealId}
            onChange={(e) => setHubspotDealId(e.target.value)}
            placeholder="Or enter the deal ID manually, e.g. 12345678901"
            className="mt-1.5 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>
        {canEditCommissionOwner && (
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600">Turnover commission owner</label>
            <SearchableSelect
              value={commissionOwner}
              onChange={setCommissionOwner}
              options={employees.map((emp) => ({ value: emp.id, label: emp.name }))}
              placeholder="Search employees…"
              allLabel="Unassigned"
              className="mt-1"
            />

            {ownerSuggestLoading && <p className="mt-1 text-xs text-gray-400">Checking HubSpot deal owner…</p>}
            {ownerSuggestError && <p className="mt-1 text-xs text-red-600">{ownerSuggestError}</p>}

            {ownerSuggestion && ownerSuggestion.matchedEmployeeId && (
              <p className="mt-1 text-xs text-gray-400">
                Auto-filled from HubSpot deal owner ({ownerSuggestion.ownerName}).
              </p>
            )}

            {ownerSuggestion && !ownerSuggestion.matchedEmployeeId && (
              <p className="mt-1 text-xs text-gray-400">
                HubSpot deal owner is {ownerSuggestion.ownerName ?? "unassigned"}, but no matching ERP employee was found.
              </p>
            )}
          </div>
        )}
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
      {success ? <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{success}</div> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save building"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={loading}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Delete building
        </button>
      </div>
    </form>
  );
}
