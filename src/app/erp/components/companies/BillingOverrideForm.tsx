"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { BILLING_METHODS, BILLING_METHOD_LABELS, EMPTY_OVERRIDE, type BillingOverride } from "@/lib/erp/clientCompanies";

/** Edit a building's or project's billing override. Blank fields fall through to the level above. */
export function BillingOverrideForm({
  endpoint,
  initial,
  levelLabel,
  onClose,
}: {
  /** PATCH route taking { override } */
  endpoint: string;
  initial: BillingOverride;
  /** "building" or "project", for the wording */
  levelLabel: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    method: initial.method ?? "",
    portalUrl: initial.portalUrl ?? "",
    sendTo: initial.sendTo.join(", "),
    cc: initial.cc.join(", "),
    note: initial.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(override: typeof form | BillingOverride) {
    setSaving(true);
    setError("");
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    onClose();
    router.refresh();
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="md">
      <h3 className="flex items-center gap-1 text-base font-semibold text-gray-900">
        Billing override for this {levelLabel}
        <InfoTip text={`Only fill what's different for this ${levelLabel}. Anything left blank comes from the level above.`} />
      </h3>
      <div className="mt-4 space-y-3">
        <div>
          <span className={labelClass.default}>Method</span>
          <SearchableSelect
            value={form.method}
            onChange={(v) => set("method", v)}
            options={BILLING_METHODS.map((m) => ({ value: m, label: BILLING_METHOD_LABELS[m] }))}
            allLabel="Same as above"
            className="mt-1"
          />
        </div>
        <label className={labelClass.default}>
          Send to
          <input value={form.sendTo} onChange={(e) => set("sendTo", e.target.value)} placeholder="Emails, separated by commas" className={inputClass.md} />
        </label>
        <label className={labelClass.default}>
          Cc
          <input value={form.cc} onChange={(e) => set("cc", e.target.value)} placeholder="Emails, separated by commas" className={inputClass.md} />
        </label>
        <label className={labelClass.default}>
          Portal link
          <input value={form.portalUrl} onChange={(e) => set("portalUrl", e.target.value)} placeholder="https://…" className={inputClass.md} />
        </label>
        <label className={labelClass.default}>
          Note
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="e.g. Put the unit number in the PO field" className={inputClass.md} />
        </label>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => save(EMPTY_OVERRIDE)} disabled={saving} className="text-red-600 hover:text-red-700">
          Clear override
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => save(form)} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
