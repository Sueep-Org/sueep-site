"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { HIRING_SOURCES, OFFICE_STAGES } from "@/lib/erp/officeHiring";

export type OfficeCandidateValues = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  location: string;
  jobOpeningId: string | null;
  stage: string;
  source: string | null;
  expectedSalary: string | null;
  shortlisted: boolean;
  internalNotes: string | null;
};

/** Details tab for an office candidate: contact info, opening, stage, salary, notes. */
export function OfficeCandidateEditor({
  initial,
  openings,
}: {
  initial: OfficeCandidateValues;
  openings: { id: string; title: string }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const set = <K extends keyof OfficeCandidateValues>(k: K, val: OfficeCandidateValues[K]) =>
    setV((prev) => ({ ...prev, [k]: val }));

  async function save() {
    setError("");
    setSavedFlash(false);
    if (!v.jobOpeningId) {
      setError("Pick an opening.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/erp/candidates/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: v.fullName,
        phone: v.phone ?? "",
        email: v.email ?? "",
        location: v.location,
        jobOpeningId: v.jobOpeningId,
        stage: v.stage,
        source: v.source ?? "",
        expectedSalary: v.expectedSalary ?? "",
        shortlisted: v.shortlisted,
        internalNotes: v.internalNotes ?? "",
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      setError(j?.error || "Could not save");
      return;
    }
    setSavedFlash(true);
    router.refresh();
    setTimeout(() => setSavedFlash(false), 2000);
  }

  async function remove() {
    if (!(await confirm({ message: "Delete this candidate? This cannot be undone." }))) return;
    setDeleting(true);
    const res = await fetch(`/api/erp/candidates/${v.id}`, { method: "DELETE" }).catch(() => null);
    setDeleting(false);
    if (!res?.ok) {
      toast("Could not delete", "error");
      return;
    }
    router.push(initial.jobOpeningId ? `/erp/candidates/openings/${initial.jobOpeningId}` : "/erp/candidates?track=office");
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass.default} htmlFor="ocd-name">Full name</label>
          <input id="ocd-name" value={v.fullName} onChange={(e) => set("fullName", e.target.value)} className={inputClass.md} />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="ocd-phone">Phone</label>
          <input id="ocd-phone" type="tel" value={v.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={inputClass.md} />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="ocd-email">Email</label>
          <input id="ocd-email" type="email" value={v.email ?? ""} onChange={(e) => set("email", e.target.value)} className={inputClass.md} />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="ocd-loc">Location</label>
          <input id="ocd-loc" value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="City, State" className={inputClass.md} />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="ocd-sal">Expected salary</label>
          <input id="ocd-sal" value={v.expectedSalary ?? ""} onChange={(e) => set("expectedSalary", e.target.value)} placeholder="e.g. around 70k" className={inputClass.md} />
        </div>
        <div>
          <label className={labelClass.default}>Opening</label>
          <SearchableSelect
            className="mt-1"
            value={v.jobOpeningId ?? ""}
            onChange={(val) => set("jobOpeningId", val || null)}
            options={openings.map((o) => ({ value: o.id, label: o.title }))}
            placeholder="Search openings…"
            allLabel="- None -"
          />
        </div>
        <div>
          <label className={`${labelClass.default} flex items-center gap-1`} htmlFor="ocd-stage">
            Stage
            <InfoTip text="Hired opens the Paperwork, Onboarding and Signing tabs, same as field hires." />
          </label>
          <select id="ocd-stage" value={v.stage} onChange={(e) => set("stage", e.target.value)} className={inputClass.md}>
            {OFFICE_STAGES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass.default}>Source</label>
          <SearchableSelect
            className="mt-1"
            value={v.source ?? ""}
            onChange={(val) => set("source", val || null)}
            options={HIRING_SOURCES.map((s) => ({ value: s.value, label: s.label }))}
            placeholder="Where they came from…"
            allLabel="- None -"
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
          <input type="checkbox" checked={v.shortlisted} onChange={(e) => set("shortlisted", e.target.checked)} className="accent-pink-600" />
          Shortlisted
        </label>
      </div>
      <div>
        <label className={labelClass.default} htmlFor="ocd-notes">Notes</label>
        <textarea
          id="ocd-notes"
          rows={6}
          value={v.internalNotes ?? ""}
          onChange={(e) => set("internalNotes", e.target.value)}
          placeholder="Phone call notes, interview impressions, next steps…"
          className={inputClass.md}
        />
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {savedFlash ? <p className="text-sm text-emerald-600">Saved.</p> : null}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={saving || deleting}>{saving ? "Saving…" : "Save changes"}</Button>
        <Button size="sm" variant="danger" onClick={() => void remove()} disabled={saving || deleting}>
          {deleting ? "Deleting…" : "Delete candidate"}
        </Button>
      </div>
    </div>
  );
}
