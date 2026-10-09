"use client";

import { useMemo, useState } from "react";
import { centsToDollars } from "@/lib/erp/money";
import { Button, Modal, inputClass } from "@/app/erp/components/ui";

export type LinkTarget = { id: string; label: string; hint: string };
export type ExistingLink = { targetId: string | null; amountCents: number; manual: boolean };

/** Even split in cents, any leftover cents on the first pick. */
function splitEvenly(totalCents: number, ids: string[]): Record<string, string> {
  if (ids.length === 0) return {};
  const each = Math.floor(totalCents / ids.length);
  const extra = totalCents - each * ids.length;
  return Object.fromEntries(ids.map((id, i) => [id, ((each + (i === 0 ? extra : 0)) / 100).toFixed(2)]));
}

/**
 * Pick which units (building) or SOV items / change orders (project) one
 * HubSpot invoice covers, with each one's share. Saves through
 * /api/erp/hubspot-invoice-links; saved picks override the automatic match.
 */
export function InvoiceLinkModal({
  open,
  onClose,
  onSaved,
  scope,
  ownerId,
  invoice,
  targets,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  scope: "building" | "project";
  ownerId: string;
  invoice: { id: string; number: string | null; billedCents: number | null };
  targets: LinkTarget[];
  existing: ExistingLink[];
}) {
  const total = invoice.billedCents ?? 0;
  const initial = existing.filter((l) => l.targetId) as Array<ExistingLink & { targetId: string }>;
  const [selected, setSelected] = useState<string[]>(initial.map((l) => l.targetId));
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((l) => [l.targetId, (l.amountCents / 100).toFixed(2)])),
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? targets.filter((t) => `${t.label} ${t.hint}`.toLowerCase().includes(q)) : targets;
  }, [targets, query]);

  const hasManual = existing.some((l) => l.manual);
  const sumCents = selected.reduce((s, id) => s + Math.round(Number(amounts[id] || 0) * 100), 0);

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    // Keep amounts evenly split until someone types their own.
    setAmounts((prev) => {
      const untouched = selected.every((s) => prev[s] === splitEvenly(total, selected)[s]);
      return untouched ? splitEvenly(total, next) : { ...prev, [id]: prev[id] ?? "0.00" };
    });
  }

  async function save(links: Array<{ targetId: string; amountCents: number }>) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/erp/hubspot-invoice-links", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, ownerId, hubspotInvoiceId: invoice.id, links }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Save failed (${res.status})`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const noun = scope === "building" ? "units" : "SOV items or change orders";

  return (
    <Modal open={open} onClose={onClose} dismissible={false} size="lg">
      <h2 className="text-base font-semibold text-gray-900">Link {invoice.number ?? "invoice"}</h2>
      <p className="mt-0.5 text-sm text-gray-500">
        Invoice total {centsToDollars(total)}. Pick every {scope === "building" ? "unit" : "item"} it covers.
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${noun}...`}
        className={`mt-3 ${inputClass.md}`}
        autoFocus
      />

      <ul className="mt-2 max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
        {filtered.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matches.</li>}
        {filtered.map((t) => {
          const checked = selected.includes(t.id);
          return (
            <li key={t.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${checked ? "bg-pink-50/50" : ""}`}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={checked} onChange={() => toggle(t.id)} className="h-4 w-4 shrink-0 accent-pink-600" />
                <span className="min-w-0">
                  <span className="block truncate text-gray-900" title={t.label}>{t.label}</span>
                  {t.hint && <span className="block text-xs text-gray-400">{t.hint}</span>}
                </span>
              </label>
              {checked && (
                <span className="flex shrink-0 items-center gap-1 text-gray-500">
                  $
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amounts[t.id] ?? ""}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm"
                    aria-label={`Amount for ${t.label}`}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {selected.length > 0 && (
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={sumCents === total ? "text-gray-500" : "text-amber-700"}>
            {selected.length} picked, {centsToDollars(sumCents)} of {centsToDollars(total)}
          </span>
          <button type="button" onClick={() => setAmounts(splitEvenly(total, selected))} className="text-pink-600 hover:underline">
            Split evenly
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-2">
        <div>
          {hasManual && (
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => save([])} title="Remove these links and let the automatic match decide again">
              Reset to automatic
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={saving || selected.length === 0}
            onClick={() => save(selected.map((id) => ({ targetId: id, amountCents: Math.round(Number(amounts[id] || 0) * 100) })))}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
