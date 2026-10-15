"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import {
  BILLING_FREQUENCIES,
  BILLING_FREQUENCY_LABELS,
  BILLING_METHODS,
  BILLING_METHOD_LABELS,
  COMPANY_TYPES,
  COMPANY_TYPE_LABELS,
  PORTAL_METHODS,
  type BillingProfile,
  type CompanyType,
} from "@/lib/erp/clientCompanies";

export type CompanyFormValues = {
  id: string;
  name: string;
  type: CompanyType;
  aliases: string[];
  notes: string | null;
  archived: boolean;
} & BillingProfile;

/** New company (company null) or edit one, including its billing profile. */
export function CompanyForm({ company, onClose }: { company: CompanyFormValues | null; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: company?.name ?? "",
    type: company?.type ?? "",
    aliases: company?.aliases.join(", ") ?? "",
    notes: company?.notes ?? "",
    archived: company?.archived ?? false,
    billingMethod: company?.billingMethod ?? "",
    billingPortalUrl: company?.billingPortalUrl ?? "",
    billingSendTo: company?.billingSendTo.join(", ") ?? "",
    billingCc: company?.billingCc.join(", ") ?? "",
    billingCutoffDay: company?.billingCutoffDay?.toString() ?? "",
    billingCutoffNote: company?.billingCutoffNote ?? "",
    billingFrequency: company?.billingFrequency ?? "",
    paymentTermsDays: company?.paymentTermsDays?.toString() ?? "",
    billingInstructions: company?.billingInstructions ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(company ? `/api/erp/companies/${company.id}` : "/api/erp/companies", {
      method: company ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    onClose();
    if (!company && data.id) router.push(`/erp/companies/${data.id}`);
    else router.refresh();
  }

  const isPortal = (PORTAL_METHODS as readonly string[]).includes(form.billingMethod);

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="lg">
      <h3 className="text-base font-semibold text-gray-900">{company ? `Edit ${company.name}` : "New company"}</h3>
      <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass.default}>
            Name
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass.md} autoFocus />
          </label>
          <div>
            <span className={labelClass.default}>Type</span>
            <SearchableSelect
              value={form.type}
              onChange={(v) => set("type", v)}
              options={COMPANY_TYPES.map((t) => ({ value: t, label: COMPANY_TYPE_LABELS[t] }))}
              allLabel="Pick a type"
              className="mt-1"
            />
          </div>
        </div>
        <label className={labelClass.default}>
          <span className="inline-flex items-center gap-1">
            Other names
            <InfoTip text="Other spellings people use, separated by commas, e.g. JAG. Search finds the company under any of them." />
          </span>
          <input value={form.aliases} onChange={(e) => set("aliases", e.target.value)} className={inputClass.md} />
        </label>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Billing</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={labelClass.default}>Method</span>
            <SearchableSelect
              value={form.billingMethod}
              onChange={(v) => set("billingMethod", v)}
              options={BILLING_METHODS.map((m) => ({ value: m, label: BILLING_METHOD_LABELS[m] }))}
              allLabel="Not set"
              className="mt-1"
            />
          </div>
          <div>
            <span className={labelClass.default}>How often</span>
            <SearchableSelect
              value={form.billingFrequency}
              onChange={(v) => set("billingFrequency", v)}
              options={BILLING_FREQUENCIES.map((f) => ({ value: f, label: BILLING_FREQUENCY_LABELS[f] }))}
              allLabel="Not set"
              className="mt-1"
            />
          </div>
        </div>
        <label className={labelClass.default}>
          Send to
          <input value={form.billingSendTo} onChange={(e) => set("billingSendTo", e.target.value)} placeholder="Emails, separated by commas" className={inputClass.md} />
        </label>
        <label className={labelClass.default}>
          Cc
          <input value={form.billingCc} onChange={(e) => set("billingCc", e.target.value)} placeholder="Emails, separated by commas" className={inputClass.md} />
        </label>
        {(isPortal || form.billingPortalUrl) && (
          <label className={labelClass.default}>
            Portal link
            <input value={form.billingPortalUrl} onChange={(e) => set("billingPortalUrl", e.target.value)} placeholder="https://…" className={inputClass.md} />
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelClass.default}>
            <span className="inline-flex items-center gap-1">
              Cutoff day
              <InfoTip text="Day of the month invoices or pay apps are due, e.g. 20. Used later for reminders." />
            </span>
            <input type="number" min={1} max={31} value={form.billingCutoffDay} onChange={(e) => set("billingCutoffDay", e.target.value)} className={inputClass.md} />
          </label>
          <label className={`${labelClass.default} sm:col-span-2`}>
            Cutoff note
            <input value={form.billingCutoffNote} onChange={(e) => set("billingCutoffNote", e.target.value)} placeholder="e.g. Pay app with lien waiver" className={inputClass.md} />
          </label>
        </div>
        <label className={labelClass.default}>
          <span className="inline-flex items-center gap-1">
            Payment terms (days)
            <InfoTip text="Net days, e.g. 30. Leave blank if unknown." />
          </span>
          <input type="number" min={0} max={365} value={form.paymentTermsDays} onChange={(e) => set("paymentTermsDays", e.target.value)} className={`${inputClass.md} sm:w-40`} />
        </label>
        <label className={labelClass.default}>
          <span className="inline-flex items-center gap-1">
            Billing instructions
            <InfoTip text="Not encrypted. Portal passwords go in Portal logins below, never here." />
          </span>
          <textarea value={form.billingInstructions} onChange={(e) => set("billingInstructions", e.target.value)} rows={3} className={inputClass.md} />
        </label>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Other</p>
        <label className={labelClass.default}>
          Notes
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputClass.md} />
        </label>
        {company && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.archived} onChange={(e) => set("archived", e.target.checked)} />
            Archived
            <InfoTip text="Hidden from pickers. Buildings and projects already linked keep it." />
          </label>
        )}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !form.name.trim() || !form.type}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}
