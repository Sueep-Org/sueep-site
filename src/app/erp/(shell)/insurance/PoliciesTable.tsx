"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { POLICY_TYPES, expiryStatus, formatLimit, occurrenceLabel, policyTypeLabel } from "@/lib/erp/insurance";
import { ExpiryBadge, Included } from "./badges";
import { centsToField, type PolicyRow } from "./types";
import { PastTerms } from "./PastTerms";
import { fmtDay, fmtMoney } from "./format";

export function PoliciesTable({ policies }: { policies: PolicyRow[] }) {
  const [editing, setEditing] = useState<PolicyRow | "new" | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          + Add policy
        </Button>
      </div>

      {policies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">No policies yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Policy</th>
                <th className="px-3 py-2 font-medium">Limits</th>
                <th className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    Premium
                    <InfoTip text="What this term costs. Spread over the term as overhead on the Finance dashboard." />
                  </span>
                </th>
                <th className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    Includes
                    <InfoTip text="What this policy lets us put on a certificate without a policy change: additional insured (AI), waiver of subrogation, and primary and noncontributory (P&NC)." />
                  </span>
                </th>
                <th className="px-3 py-2 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {policies.map((p) => (
                <tr key={p.id} onClick={() => setEditing(p)} className={`cursor-pointer hover:bg-gray-50 ${p.active ? "" : "text-gray-400"}`}>
                  <td className="px-3 py-2.5">
                    <div className={`font-medium ${p.active ? "text-gray-900" : ""}`}>{policyTypeLabel(p.policyType)}</div>
                    <div className="text-xs text-gray-500">
                      {p.carrier}
                      {!p.active ? " · Inactive" : !p.onCertificates ? " · Not on our COIs" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {[p.eachOccurrenceCents, p.aggregateCents].filter((c) => c != null).map((c) => formatLimit(c)).join(" / ") || "Not set"}
                    {p.aggregatePerProject && <span className="ml-1.5 text-xs text-gray-500">per project</span>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {p.premiumCents != null ? fmtMoney(p.premiumCents) : <span className={p.active ? "text-amber-600" : ""}>Not set</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Included ai={p.blanketAdditionalInsured} waiver={p.waiverOfSubrogation} pnc={p.primaryNoncontributory} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums">{fmtDay(p.expiresAt)}</span>
                      {p.active && <ExpiryBadge status={expiryStatus(new Date(`${p.expiresAt}T00:00:00Z`))} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <PolicyForm policy={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function PolicyForm({ policy, onClose }: { policy: PolicyRow | null; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState({
    policyType: policy?.policyType ?? "",
    carrier: policy?.carrier ?? "",
    policyNumber: policy?.policyNumber ?? "",
    effectiveDate: policy?.effectiveDate ?? "",
    expiresAt: policy?.expiresAt ?? "",
    eachOccurrenceCents: centsToField(policy?.eachOccurrenceCents ?? null),
    aggregateCents: centsToField(policy?.aggregateCents ?? null),
    aggregatePerProject: policy?.aggregatePerProject ?? false,
    otherLimits: policy?.otherLimits ?? "",
    blanketAdditionalInsured: policy?.blanketAdditionalInsured ?? false,
    waiverOfSubrogation: policy?.waiverOfSubrogation ?? false,
    primaryNoncontributory: policy?.primaryNoncontributory ?? false,
    notes: policy?.notes ?? "",
    active: policy?.active ?? true,
    onCertificates: policy?.onCertificates ?? true,
    premiumCents: centsToField(policy?.premiumCents ?? null),
    auditAdjustmentCents: centsToField(policy?.auditAdjustmentCents ?? null),
    auditDate: policy?.auditDate ?? "",
    cancelledOn: policy?.cancelledOn ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const hasAggregate = form.policyType === "GENERAL_LIABILITY" || form.policyType === "UMBRELLA" || form.policyType === "OTHER";
  // Moving the expiration later is a renewal: the old term's cost is kept
  // under Past terms, and its audit and cancel date stay with it.
  const renewing = !!policy && !!form.expiresAt && form.expiresAt > policy.expiresAt;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      // Money fields are sent as dollar text; the API converts to cents.
      const res = await fetch(policy ? `/api/erp/insurance/policies/${policy.id}` : "/api/erp/insurance/policies", {
        method: policy ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, aggregateCents: hasAggregate ? form.aggregateCents : "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      toast(
        data.reissueCount > 0
          ? `Policy renewed. ${data.reissueCount} COI${data.reissueCount === 1 ? " needs" : "s need"} a new version, see the Renewals tab.`
          : policy
            ? "Policy saved."
            : "Policy added.",
      );
      onClose();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!policy) return;
    const ok = await confirm({
      title: "Delete this policy?",
      message: "This removes it for good. To keep it for history, uncheck Active instead.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const res = await fetch(`/api/erp/insurance/policies/${policy.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete");
      return;
    }
    toast("Policy deleted.");
    onClose();
    router.refresh();
  }

  const checkbox = (key: "aggregatePerProject" | "blanketAdditionalInsured" | "waiverOfSubrogation" | "primaryNoncontributory" | "active" | "onCertificates", text: string) => (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="h-4 w-4 text-pink-600" />
      {text}
    </label>
  );

  return (
    <Modal open onClose={onClose} dismissible={false} size="lg">
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">{policy ? "Edit policy" : "Add policy"}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass.default} htmlFor="pol-type">Type *</label>
            <SearchableSelect
              id="pol-type"
              value={form.policyType}
              onChange={(v) => set("policyType", v)}
              options={POLICY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              placeholder="Search types…"
              allLabel="Pick a type"
              className="mt-1"
            />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="pol-carrier">
              Carrier * <InfoTip text="The insurance company listed on the COI (e.g. Gotham Insurance Company), not the broker. Put the broker in Notes." />
            </label>
            <input id="pol-carrier" type="text" value={form.carrier} onChange={(e) => set("carrier", e.target.value)} placeholder="e.g. Gotham Insurance Company" className={inputClass.md} />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="pol-number">Policy number</label>
            <input id="pol-number" type="text" value={form.policyNumber} onChange={(e) => set("policyNumber", e.target.value)} className={inputClass.md} />
          </div>
          <div />
          <div>
            <label className={labelClass.default} htmlFor="pol-eff">Effective date</label>
            <input id="pol-eff" type="date" value={form.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} className={inputClass.md} />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="pol-exp">Expiration date *</label>
            <input
              id="pol-exp"
              type="date"
              value={form.expiresAt}
              onChange={(e) => {
                const v = e.target.value;
                setForm((f) =>
                  policy && v > policy.expiresAt ? { ...f, expiresAt: v, auditAdjustmentCents: "", auditDate: "", cancelledOn: "" } : { ...f, expiresAt: v },
                );
              }}
              className={inputClass.md}
            />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="pol-occ">{occurrenceLabel(form.policyType)}</label>
            <input id="pol-occ" type="text" inputMode="decimal" placeholder="$0" value={form.eachOccurrenceCents} onChange={(e) => set("eachOccurrenceCents", e.target.value)} className={inputClass.md} />
          </div>
          {hasAggregate && (
            <div>
              <label className={labelClass.default} htmlFor="pol-agg">Aggregate</label>
              <input id="pol-agg" type="text" inputMode="decimal" placeholder="$0" value={form.aggregateCents} onChange={(e) => set("aggregateCents", e.target.value)} className={inputClass.md} />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={labelClass.default} htmlFor="pol-other">
              Other limits <InfoTip text="Anything else on the policy page, e.g. products aggregate, personal and advertising injury, medical expenses." />
            </label>
            <input id="pol-other" type="text" value={form.otherLimits} onChange={(e) => set("otherLimits", e.target.value)} placeholder="e.g. EL $1M / $1M / $1M" className={inputClass.md} />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className={`${labelClass.default} flex items-center gap-1`}>
            Cost <InfoTip text="Counts as overhead on the Finance dashboard: the premium spread evenly over the term, the audit amount on its date." />
          </legend>
          {renewing && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Renewing: the old term and its {policy?.premiumCents != null ? `${fmtMoney(policy.premiumCents)} premium` : "cost"} are saved under Past terms. Enter
              the new term&apos;s premium below.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass.default} htmlFor="pol-premium">
                Premium for this term <InfoTip text="Total for the term, fees and taxes included. If it's paid monthly, add up the payments." />
              </label>
              <input id="pol-premium" type="text" inputMode="decimal" placeholder="$0" value={form.premiumCents} onChange={(e) => set("premiumCents", e.target.value)} className={inputClass.md} />
            </div>
            <div>
              <label className={labelClass.default} htmlFor="pol-cancel">
                Cancelled on <InfoTip text="Only if it was cancelled before it expired. The premium stops counting that day." />
              </label>
              <input id="pol-cancel" type="date" value={form.cancelledOn} onChange={(e) => set("cancelledOn", e.target.value)} className={inputClass.md} />
            </div>
            <div>
              <label className={labelClass.default} htmlFor="pol-audit">
                Audit amount <InfoTip text="Bill after this term's audit, or a negative number for a refund (e.g. -450). Counts in full on the audit date." />
              </label>
              <input id="pol-audit" type="text" inputMode="decimal" placeholder="$0" value={form.auditAdjustmentCents} onChange={(e) => set("auditAdjustmentCents", e.target.value)} className={inputClass.md} />
            </div>
            <div>
              <label className={labelClass.default} htmlFor="pol-audit-date">Audit date</label>
              <input id="pol-audit-date" type="date" value={form.auditDate} onChange={(e) => set("auditDate", e.target.value)} className={inputClass.md} />
            </div>
          </div>
          {policy && <PastTerms policyId={policy.id} terms={policy.terms} />}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className={`${labelClass.default} flex items-center gap-1`}>
            Includes <InfoTip text="Check what the policy page in CoverDash lists as Included. Unchecked items get flagged when a holder requires them." />
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {checkbox("blanketAdditionalInsured", "Additional insured")}
            {checkbox("waiverOfSubrogation", "Waiver of subrogation")}
            {checkbox("primaryNoncontributory", "Primary and noncontributory")}
          </div>
          {form.policyType === "GENERAL_LIABILITY" && (
            <div className="flex items-center gap-1">
              {checkbox("aggregatePerProject", "Aggregate applies per project")}
              <InfoTip text="Each project gets its own aggregate limit instead of sharing one for the year. CoverDash shows it as General Aggregate Limit Applies Per: Project." />
            </div>
          )}
        </fieldset>

        <div>
          <label className={labelClass.default} htmlFor="pol-notes">Notes</label>
          <textarea id="pol-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Through RT Specialty" className={inputClass.md} />
        </div>

        <div className="flex items-center gap-1">
          {checkbox("onCertificates", "On our COIs")}
          <InfoTip text="Usually listed on the COIs we give GCs. Uncheck for policies CoverDash leaves off, like our owned auto. Checked policies are pre-selected when adding a COI to a project." />
        </div>
        <div className="flex items-center gap-1">
          {checkbox("active", "Active")}
          <InfoTip text="Uncheck when a policy is cancelled or replaced. It stays on the list for history. When a policy renews, just update its dates." />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {policy ? (
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={remove}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
