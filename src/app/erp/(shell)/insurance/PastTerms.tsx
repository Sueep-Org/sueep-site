"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { centsToField, type PolicyTermRow } from "./types";
import { fmtDay, fmtMoney } from "./format";

/**
 * A policy's earlier terms and what they cost, inside the policy form.
 * Saved on their own (not with the policy's Save) since an audit usually
 * arrives months after the renewal. Rendered inside the policy <form>, so
 * Enter in these fields must not submit it.
 */
export function PastTerms({ policyId, terms }: { policyId: string; terms: PolicyTermRow[] }) {
  const [editing, setEditing] = useState<PolicyTermRow | "new" | null>(null);

  return (
    <div className="rounded-md border border-gray-200">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5">
        <span className="flex items-center gap-1 text-xs font-medium text-gray-600">
          Past terms
          <InfoTip text="Earlier terms of this policy, so past months on the Finance dashboard keep their cost. Saved automatically when you renew. Add an audit to an old term here when it comes in." />
        </span>
        {editing !== "new" && (
          <Button variant="ghost" size="xs" onClick={() => setEditing("new")}>
            + Add past term
          </Button>
        )}
      </div>
      {terms.length === 0 && editing !== "new" ? (
        <p className="px-3 py-2 text-xs text-gray-400">None yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {editing === "new" && (
            <li className="px-3 py-2">
              <TermEditor policyId={policyId} term={null} onDone={() => setEditing(null)} />
            </li>
          )}
          {terms.map((t) => (
            <li key={t.id} className="px-3 py-2">
              {editing !== "new" && editing?.id === t.id ? (
                <TermEditor policyId={policyId} term={t} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="font-medium text-gray-800">
                      {t.effectiveDate ? fmtDay(t.effectiveDate) : "?"} to {fmtDay(t.expiresAt)}
                      {t.cancelledOn && <span className="ml-1.5 text-gray-500">(cancelled {fmtDay(t.cancelledOn)})</span>}
                    </div>
                    <div className="text-gray-500">
                      {t.premiumCents != null ? `${fmtMoney(t.premiumCents)} premium` : "No premium"}
                      {t.auditAdjustmentCents != null && t.auditDate && (
                        <>
                          {" · "}audit {t.auditAdjustmentCents < 0 ? `refund ${fmtMoney(-t.auditAdjustmentCents)}` : fmtMoney(t.auditAdjustmentCents)} on{" "}
                          {fmtDay(t.auditDate)}
                        </>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="xs" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TermEditor({ policyId, term, onDone }: { policyId: string; term: PolicyTermRow | null; onDone: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState({
    effectiveDate: term?.effectiveDate ?? "",
    expiresAt: term?.expiresAt ?? "",
    premiumCents: centsToField(term?.premiumCents ?? null),
    auditAdjustmentCents: centsToField(term?.auditAdjustmentCents ?? null),
    auditDate: term?.auditDate ?? "",
    cancelledOn: term?.cancelledOn ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const base = `/api/erp/insurance/policies/${policyId}/terms`;

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(term ? `${base}/${term.id}` : base, {
      method: term ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    toast(term ? "Past term saved." : "Past term added.");
    onDone();
    router.refresh();
  }

  async function remove() {
    if (!term) return;
    const ok = await confirm({ title: "Delete this past term?", message: "Its cost comes off the Finance dashboard for those months.", confirmLabel: "Delete" });
    if (!ok) return;
    const res = await fetch(`${base}/${term.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete.");
      return;
    }
    toast("Past term deleted.");
    onDone();
    router.refresh();
  }

  const field = (key: keyof typeof form, label: string, type: "date" | "money", placeholder?: string) => (
    <label className={labelClass.compact}>
      {label}
      <input
        type={type === "date" ? "date" : "text"}
        inputMode={type === "money" ? "decimal" : undefined}
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        className={`${inputClass.sm} mt-0.5`}
      />
    </label>
  );

  return (
    <div
      className="space-y-2"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
          e.preventDefault();
          save();
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {field("effectiveDate", "Effective date", "date")}
        {field("expiresAt", "Expiration date *", "date")}
        {field("premiumCents", "Premium", "money", "$0")}
        {field("cancelledOn", "Cancelled on", "date")}
        {field("auditAdjustmentCents", "Audit amount (negative for refund)", "money", "$0")}
        {field("auditDate", "Audit date", "date")}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <div>
          {term && (
            <Button variant="ghost" size="xs" onClick={remove} className="text-red-600 hover:text-red-700">
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="xs" onClick={onDone} disabled={saving}>
            Cancel
          </Button>
          <Button size="xs" onClick={save} disabled={saving || !form.expiresAt}>
            {saving ? "Saving…" : "Save term"}
          </Button>
        </div>
      </div>
    </div>
  );
}
