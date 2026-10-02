"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { checkRequirements, requirementSummary, type HolderRequirements, type RequirementCheck } from "@/lib/erp/insurance";
import { parseMoneyInput } from "@/lib/erp/money";
import { centsToField, type HolderRow, type PolicyRow } from "../types";

function CheckBadge({ checks }: { checks: RequirementCheck[] }) {
  const gaps = checks.filter((c) => c.level === "gap").length;
  const notes = checks.length - gaps;
  const pill = "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium";
  if (gaps) return <span className={`${pill} bg-red-50 text-red-700`}>{gaps} gap{gaps === 1 ? "" : "s"}</span>;
  if (notes) return <span className={`${pill} bg-amber-50 text-amber-700`}>Needs umbrella</span>;
  return <span className={`${pill} bg-emerald-50 text-emerald-700`}>Covered</span>;
}

export function HoldersTable({ holders, policies }: { holders: HolderRow[]; policies: PolicyRow[] }) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<HolderRow | "new" | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return holders.filter((h) => {
      if (h.archived && !showArchived) return false;
      if (!q) return true;
      return [h.name, ...h.aliases, h.contactName ?? "", h.contactEmail ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [holders, query, showArchived]);

  const archivedCount = holders.filter((h) => h.archived).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search holders…"
            aria-label="Search certificate holders"
            className={`${inputClass.xs} w-72`}
          />
          {archivedCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-3.5 w-3.5 text-pink-600" />
              Show archived ({archivedCount})
            </label>
          )}
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          + Add holder
        </Button>
      </div>

      {policies.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Add our policies on the Our Policies tab to check requirements.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {holders.length === 0 ? "No certificate holders yet." : "No holders match that search."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Holder</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Requires</th>
                <th className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    Our coverage
                    <InfoTip
                      align="right"
                      text="Their requirements checked against our active policies. Covered: nothing to do. Needs umbrella: put the umbrella on the certificate. Gaps: our coverage falls short, talk to the broker first."
                    />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((h) => {
                const summary = requirementSummary(h);
                return (
                  <tr key={h.id} onClick={() => setEditing(h)} className={`cursor-pointer hover:bg-gray-50 ${h.archived ? "text-gray-400" : ""}`}>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-gray-900">{h.name}</div>
                      {h.archived && <div className="text-xs">Archived</div>}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-gray-600">
                      {h.contactName && <div>{h.contactName}</div>}
                      {h.contactEmail && <div className="text-gray-500">{h.contactEmail}</div>}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-gray-600">
                      {summary.length ? summary.join(" · ") : <span className="text-gray-400">Not set</span>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {summary.length > 0 && policies.length > 0 ? <CheckBadge checks={checkRequirements(h, policies)} /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <HolderForm holder={editing === "new" ? null : editing} policies={policies} onClose={() => setEditing(null)} />}
    </section>
  );
}

const MONEY_KEYS = ["reqGlOccurrenceCents", "reqGlAggregateCents", "reqAutoCents", "reqUmbrellaCents", "reqWcEmployersLiabilityCents"] as const;

function HolderForm({ holder, policies, onClose }: { holder: HolderRow | null; policies: PolicyRow[]; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState({
    name: holder?.name ?? "",
    aliases: holder?.aliases.join("\n") ?? "",
    address: holder?.address ?? "",
    contactName: holder?.contactName ?? "",
    contactEmail: holder?.contactEmail ?? "",
    contactPhone: holder?.contactPhone ?? "",
    reqGlOccurrenceCents: centsToField(holder?.reqGlOccurrenceCents ?? null),
    reqGlAggregateCents: centsToField(holder?.reqGlAggregateCents ?? null),
    reqAutoCents: centsToField(holder?.reqAutoCents ?? null),
    reqUmbrellaCents: centsToField(holder?.reqUmbrellaCents ?? null),
    reqWcEmployersLiabilityCents: centsToField(holder?.reqWcEmployersLiabilityCents ?? null),
    requiresAdditionalInsured: holder?.requiresAdditionalInsured ?? false,
    requiresWaiverOfSubrogation: holder?.requiresWaiverOfSubrogation ?? false,
    requiresPrimaryNoncontributory: holder?.requiresPrimaryNoncontributory ?? false,
    additionalInsureds: holder?.additionalInsureds ?? "",
    specialWording: holder?.specialWording ?? "",
    notes: holder?.notes ?? "",
    archived: holder?.archived ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Live check against our policies while the requirements are typed in.
  const checks = useMemo(() => {
    const req = { ...form } as unknown as HolderRequirements;
    for (const k of MONEY_KEYS) (req as Record<string, unknown>)[k] = parseMoneyInput(form[k]);
    return checkRequirements(req, policies);
  }, [form, policies]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      // Money fields are sent as dollar text; the API converts to cents.
      const res = await fetch(holder ? `/api/erp/insurance/holders/${holder.id}` : "/api/erp/insurance/holders", {
        method: holder ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      toast(holder ? "Holder saved." : "Holder added.");
      onClose();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!holder) return;
    const ok = await confirm({
      title: "Delete this holder?",
      message: "This removes the profile for good. To hide it but keep it for history, check Archived instead.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const res = await fetch(`/api/erp/insurance/holders/${holder.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete");
      return;
    }
    toast("Holder deleted.");
    onClose();
    router.refresh();
  }

  const field = (key: keyof typeof form, label: string, opts: { type?: string; placeholder?: string; money?: boolean; tip?: string } = {}) => (
    <div>
      <label className={labelClass.default} htmlFor={`h-${key}`}>
        {label} {opts.tip && <InfoTip text={opts.tip} />}
      </label>
      <input
        id={`h-${key}`}
        type={opts.type ?? "text"}
        inputMode={opts.money ? "decimal" : undefined}
        placeholder={opts.placeholder ?? (opts.money ? "$0" : undefined)}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
        className={inputClass.md}
      />
    </div>
  );
  const area = (key: keyof typeof form, label: string, placeholder?: string, tip?: string) => (
    <div className="sm:col-span-2">
      <label className={labelClass.default} htmlFor={`h-${key}`}>
        {label} {tip && <InfoTip text={tip} />}
      </label>
      <textarea id={`h-${key}`} rows={2} value={form[key] as string} onChange={(e) => set(key, e.target.value as never)} placeholder={placeholder} className={inputClass.md} />
    </div>
  );
  const checkbox = (key: "requiresAdditionalInsured" | "requiresWaiverOfSubrogation" | "requiresPrimaryNoncontributory" | "archived", text: string) => (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} className="h-4 w-4 text-pink-600" />
      {text}
    </label>
  );

  return (
    <Modal open onClose={onClose} dismissible={false} size="lg">
      <form onSubmit={save} className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">{holder ? "Edit certificate holder" : "Add certificate holder"}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("name", "Name *", { placeholder: "e.g. Harkins Builders, Inc.", tip: "Exactly as it should appear in the certificate holder box. Duplicates are blocked, even with different punctuation or Inc/LLC." })}</div>
          {area("aliases", "Other names", "One per line", "Other spellings seen on past COIs, e.g. Bozzuto C/O NetVendor. Search finds the holder under any of them.")}
          {area("address", "Address")}
          {field("contactName", "Contact name")}
          {field("contactEmail", "Contact email", { type: "email" })}
          {field("contactPhone", "Contact phone", { type: "tel" })}
        </div>

        <fieldset className="space-y-3">
          <legend className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            Requirements <InfoTip text="From their sample COI or contract. Leave a limit blank if they don't specify one." />
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("reqGlOccurrenceCents", "GL each occurrence", { money: true })}
            {field("reqGlAggregateCents", "GL aggregate", { money: true })}
            {field("reqAutoCents", "Auto", { money: true })}
            {field("reqUmbrellaCents", "Umbrella", { money: true })}
            {field("reqWcEmployersLiabilityCents", "Employer's liability (workers' comp)", { money: true })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {checkbox("requiresAdditionalInsured", "Additional insured")}
            {checkbox("requiresWaiverOfSubrogation", "Waiver of subrogation")}
            {checkbox("requiresPrimaryNoncontributory", "Primary and noncontributory")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {area("additionalInsureds", "Additional insured names", "One per line", "Everyone they want listed as additional insured, e.g. the property owner.")}
            {area("specialWording", "Special wording", undefined, "Text they want in the Description of Operations box. Copy it from their sample COI so every certificate matches.")}
          </div>
        </fieldset>

        {policies.length > 0 && checks.length > 0 && (
          <div className="space-y-1 rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-700">Against our policies</p>
            <ul className="space-y-1">
              {checks.map((c) => (
                <li key={c.text} className={`text-xs ${c.level === "gap" ? "text-red-700" : "text-amber-700"}`}>
                  {c.level === "gap" ? "Gap: " : "Note: "}
                  {c.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">{area("notes", "Notes")}</div>
        <div className="flex items-center gap-1">
          {checkbox("archived", "Archived")}
          <InfoTip text="Hides the holder from lists but keeps it for history." />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {holder ? (
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
