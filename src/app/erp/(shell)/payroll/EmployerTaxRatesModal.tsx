"use client";

import { useEffect, useState } from "react";
import { Button, InfoTip, Modal, useToast } from "@/app/erp/components/ui";
import type { EmployerTaxRates } from "@/lib/erp/employerTax";

const inputCls = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-gray-50 disabled:text-gray-500";

/** One tax per line: its rate key, and its yearly cap key when it has one. */
const TAXES: { label: string; pct: keyof EmployerTaxRates; cap: keyof EmployerTaxRates | null; tip: string }[] = [
  { label: "Social Security", pct: "socialSecurityPct", cap: "socialSecurityCapCents", tip: "Stops once someone is paid the cap in a year. The cap goes up every January." },
  { label: "Medicare", pct: "medicarePct", cap: null, tip: "No yearly cap." },
  { label: "Federal unemployment (FUTA)", pct: "futaPct", cap: "futaCapCents", tip: "Only on the first $7,000 each person is paid in a year." },
  { label: "PA unemployment (SUI)", pct: "paSuiPct", cap: "paSuiCapCents", tip: "PA sends a new rate each year. Only on the first $10,000 each person is paid in a year." },
];

type Draft = Record<keyof EmployerTaxRates, string>;

function toDraft(r: EmployerTaxRates): Draft {
  const d = {} as Draft;
  for (const [k, v] of Object.entries(r) as [keyof EmployerTaxRates, number][]) {
    d[k] = k.endsWith("CapCents") ? String(v / 100) : String(v);
  }
  return d;
}

export function EmployerTaxRatesModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    fetch("/api/erp/settings/employer-tax")
      .then((r) => r.json())
      .then((d: { rates?: EmployerTaxRates; canEdit?: boolean; error?: string }) => {
        if (!d.rates) { setError(d.error ?? "Could not load tax rates"); return; }
        setDraft(toDraft(d.rates));
        setCanEdit(!!d.canEdit);
      })
      .catch(() => setError("Could not load tax rates"));
  }, [open]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    const body: Record<string, number> = {};
    for (const [k, v] of Object.entries(draft) as [keyof EmployerTaxRates, string][]) {
      body[k] = k.endsWith("CapCents") ? Math.round(Number(v) * 100) : Number(v);
    }
    try {
      const res = await fetch("/api/erp/settings/employer-tax", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(result.error ?? "Could not save"); return; }
      toast("Tax rates saved.", "success");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div>
          <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
            Employer tax rates
            <InfoTip text="What Sueep pays on top of each employee's pay (ADP calls it Employer Liability). Not taken from their check. Contractors and offshore workers have none." />
          </h2>
          {!canEdit && draft ? <p className="mt-1 text-xs text-gray-500">Only an Admin can change these.</p> : null}
        </div>
        {!draft ? (
          <p className="text-sm text-gray-400">{error || "Loading…"}</p>
        ) : (
          <div className="space-y-3">
            {TAXES.map((t) => (
              <div key={t.pct} className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-gray-600">
                  <span className="flex items-center gap-1">{t.label} % <InfoTip text={t.tip} /></span>
                  <input type="number" min="0" max="20" step="0.001" required disabled={!canEdit} value={draft[t.pct]}
                    onChange={(e) => setDraft((d) => d && { ...d, [t.pct]: e.target.value })} className={inputCls} />
                </label>
                {t.cap ? (
                  <label className="block text-xs font-medium text-gray-600">
                    Yearly cap ($)
                    <input type="number" min="0" step="1" required disabled={!canEdit} value={draft[t.cap]}
                      onChange={(e) => setDraft((d) => d && t.cap ? { ...d, [t.cap]: e.target.value } : d)} className={inputCls} />
                  </label>
                ) : <div />}
              </div>
            ))}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit && (
            <Button size="sm" type="submit" disabled={saving || !draft}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
