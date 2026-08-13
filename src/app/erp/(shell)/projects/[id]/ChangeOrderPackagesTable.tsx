"use client";

import { useState } from "react";
import { useConfirm, useToast } from "@/app/erp/components/ui";
import { centsToDollars } from "@/lib/erp/money";
import { DEFAULT_CHANGE_ORDER_LABOR_RATES } from "@/lib/changeOrderLaborRates";
import { computeChangeOrderPackagePrice } from "@/lib/changeOrderPricingPackages";

export type ChangeOrderPackageRow = {
  id: string;
  name: string;
  unitLabel: string;
  cleanerHours: number;
  foremanHours: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
type PackageRow = ChangeOrderPackageRow;

const rowInputCls =
  "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-gray-100";

function defaultRatePreview(cleanerHours: number, foremanHours: number) {
  return computeChangeOrderPackagePrice({ cleanerHours, foremanHours }, 1, DEFAULT_CHANGE_ORDER_LABOR_RATES);
}

/** One row's editable draft, kept separate from the saved PackageRow so a
 * "Save" button only shows once something actually differs from the server. */
type Draft = { name: string; unitLabel: string; cleanerHours: string; foremanHours: string };

function draftFrom(pkg: PackageRow): Draft {
  return {
    name: pkg.name,
    unitLabel: pkg.unitLabel,
    cleanerHours: String(pkg.cleanerHours),
    foremanHours: String(pkg.foremanHours),
  };
}

function isDirty(draft: Draft, pkg: PackageRow): boolean {
  return (
    draft.name !== pkg.name ||
    draft.unitLabel !== pkg.unitLabel ||
    draft.cleanerHours !== String(pkg.cleanerHours) ||
    draft.foremanHours !== String(pkg.foremanHours)
  );
}

export function ChangeOrderPackagesTable({
  initialPackages,
  canEdit = true,
}: {
  initialPackages: PackageRow[];
  /** Read-only when false — e.g. Finance can see the package list from a
   * project's Change Orders tab but only Admin/PM/Sales/Estimation edit it. */
  canEdit?: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [packages, setPackages] = useState(initialPackages);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialPackages.map((p) => [p.id, draftFrom(p)])),
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newUnitLabel, setNewUnitLabel] = useState("unit");
  const [newCleanerHours, setNewCleanerHours] = useState("");
  const [newForemanHours, setNewForemanHours] = useState("");
  const [creating, setCreating] = useState(false);

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  }

  async function createPackage() {
    setCreating(true);
    try {
      const res = await fetch("/api/erp/change-order-pricing-packages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newName,
          unitLabel: newUnitLabel,
          cleanerHours: Number(newCleanerHours) || 0,
          foremanHours: Number(newForemanHours) || 0,
        }),
      });
      const data = (await res.json()) as PackageRow & { error?: string };
      if (!res.ok) {
        toast(data.error ?? "Failed to create package", "error");
        return;
      }
      setPackages((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setDrafts((prev) => ({ ...prev, [data.id]: draftFrom(data) }));
      setNewName("");
      setNewUnitLabel("unit");
      setNewCleanerHours("");
      setNewForemanHours("");
      toast(`"${data.name}" created.`);
    } catch {
      toast("Network error", "error");
    } finally {
      setCreating(false);
    }
  }

  async function savePackage(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/erp/change-order-pricing-packages/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          unitLabel: draft.unitLabel,
          cleanerHours: Number(draft.cleanerHours) || 0,
          foremanHours: Number(draft.foremanHours) || 0,
        }),
      });
      const data = (await res.json()) as PackageRow & { error?: string };
      if (!res.ok) {
        toast(data.error ?? "Failed to save package", "error");
        return;
      }
      setPackages((prev) => prev.map((p) => (p.id === id ? data : p)));
      setDrafts((prev) => ({ ...prev, [id]: draftFrom(data) }));
      toast("Saved.");
    } catch {
      toast("Network error", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(pkg: PackageRow) {
    setBusyId(pkg.id);
    try {
      const res = await fetch(`/api/erp/change-order-pricing-packages/${pkg.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !pkg.active }),
      });
      const data = (await res.json()) as PackageRow & { error?: string };
      if (!res.ok) {
        toast(data.error ?? "Failed to update package", "error");
        return;
      }
      setPackages((prev) => prev.map((p) => (p.id === pkg.id ? data : p)));
    } catch {
      toast("Network error", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function deletePackage(pkg: PackageRow) {
    if (!(await confirm({ message: `Delete "${pkg.name}"? This can't be undone.` }))) return;
    setBusyId(pkg.id);
    try {
      const res = await fetch(`/api/erp/change-order-pricing-packages/${pkg.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast(data.error ?? "Delete failed", "error");
        return;
      }
      setPackages((prev) => prev.filter((p) => p.id !== pkg.id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[pkg.id];
        return next;
      });
      toast(`"${pkg.name}" deleted.`);
    } catch {
      toast("Network error", "error");
    } finally {
      setBusyId(null);
    }
  }

  const newPreview = defaultRatePreview(Number(newCleanerHours) || 0, Number(newForemanHours) || 0);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Name</th>
              <th className="px-4 py-2.5 text-left font-semibold">Unit</th>
              <th className="px-4 py-2.5 text-left font-semibold">Cleaner hrs/unit</th>
              <th className="px-4 py-2.5 text-left font-semibold">Foreman hrs/unit</th>
              <th className="px-4 py-2.5 text-left font-semibold">At default rates</th>
              <th className="px-4 py-2.5 text-left font-semibold">Active</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {packages.map((pkg) => {
              const draft = drafts[pkg.id] ?? draftFrom(pkg);
              const dirty = isDirty(draft, pkg);
              const busy = busyId === pkg.id;
              const preview = defaultRatePreview(Number(draft.cleanerHours) || 0, Number(draft.foremanHours) || 0);
              return (
                <tr key={pkg.id} className={pkg.active ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5">
                    <input
                      className={rowInputCls}
                      value={draft.name}
                      disabled={busy || !canEdit}
                      onChange={(e) => setDraft(pkg.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      className={`${rowInputCls} w-24`}
                      value={draft.unitLabel}
                      disabled={busy || !canEdit}
                      onChange={(e) => setDraft(pkg.id, { unitLabel: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step="0.25"
                      className={`${rowInputCls} w-24`}
                      value={draft.cleanerHours}
                      disabled={busy || !canEdit}
                      onChange={(e) => setDraft(pkg.id, { cleanerHours: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min={0}
                      step="0.25"
                      className={`${rowInputCls} w-24`}
                      value={draft.foremanHours}
                      disabled={busy || !canEdit}
                      onChange={(e) => setDraft(pkg.id, { foremanHours: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500">
                    {centsToDollars(preview.totalCents)}/{draft.unitLabel || "unit"}
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={pkg.active}
                      disabled={busy || !canEdit}
                      onChange={() => void toggleActive(pkg)}
                      className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {dirty ? (
                      <button
                        type="button"
                        disabled={busy || !canEdit}
                        onClick={() => void savePackage(pkg.id)}
                        className="mr-3 rounded-md bg-pink-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || !canEdit}
                      onClick={() => void deletePackage(pkg)}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {packages.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No pricing packages yet. Add one below.</p>
        )}
      </div>

      {canEdit ? (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">New package</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <input
            className={rowInputCls}
            placeholder="Name (e.g. Extra prep coat)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className={rowInputCls}
            placeholder="Unit (e.g. unit, day)"
            value={newUnitLabel}
            onChange={(e) => setNewUnitLabel(e.target.value)}
          />
          <input
            type="number"
            min={0}
            step="0.25"
            className={rowInputCls}
            placeholder="Cleaner hrs/unit"
            value={newCleanerHours}
            onChange={(e) => setNewCleanerHours(e.target.value)}
          />
          <input
            type="number"
            min={0}
            step="0.25"
            className={rowInputCls}
            placeholder="Foreman hrs/unit"
            value={newForemanHours}
            onChange={(e) => setNewForemanHours(e.target.value)}
          />
          <button
            type="button"
            disabled={creating || !newName.trim()}
            onClick={() => void createPackage()}
            className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {creating ? "Adding…" : "Add package"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          At default rates, this would price to {centsToDollars(newPreview.totalCents)}/{newUnitLabel || "unit"}.
        </p>
      </div>
      ) : null}
    </div>
  );
}
