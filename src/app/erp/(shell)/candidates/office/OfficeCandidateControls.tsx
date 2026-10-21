"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, inputClass, labelClass, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { HIRING_SOURCES, OFFICE_STAGES, officeStageMeta } from "@/lib/erp/officeHiring";

export async function patchCandidate(id: string, body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/erp/candidates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (res?.ok) return null;
  const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
  return j?.error || "Could not save";
}

/** Inline stage pill, same idea as CandidateStatusSelect on the Field tab. */
export function OfficeStageSelect({ id, initialStage }: { id: string; initialStage: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [stage, setStage] = useState(initialStage ?? "NEW");
  const [, startTransition] = useTransition();
  const meta = officeStageMeta(stage);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const prev = stage;
    const next = e.target.value;
    setStage(next);
    startTransition(async () => {
      const err = await patchCandidate(id, { stage: next });
      if (err) {
        setStage(prev);
        toast(err, "error");
        return;
      }
      router.refresh();
    });
  }

  return (
    <select
      value={stage}
      onChange={onChange}
      aria-label="Stage"
      className={`cursor-pointer rounded-full border-0 px-2 py-0.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-offset-1 ${meta.cls}`}
    >
      {OFFICE_STAGES.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}

/** Star toggle for the shortlist (the green rows in the old spreadsheet). */
export function ShortlistStar({ id, initial }: { id: string; initial: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const err = await patchCandidate(id, { shortlisted: next });
      if (err) {
        setOn(!next);
        toast(err, "error");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Remove from shortlist" : "Add to shortlist"}
      title={on ? "Shortlisted" : "Shortlist"}
      className={`text-base leading-none ${on ? "text-amber-400" : "text-gray-300 hover:text-amber-300"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

/** "+ Add candidate" for an opening page. */
export function AddOfficeCandidateButton({ openingId }: { openingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dupId, setDupId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setDupId(null);
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/erp/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        track: "OFFICE",
        jobOpeningId: openingId,
        fullName: fd.get("fullName"),
        phone: fd.get("phone"),
        email: fd.get("email"),
        location: fd.get("location"),
        expectedSalary: fd.get("expectedSalary"),
        stage: fd.get("stage"),
        source,
        shortlisted: fd.get("shortlisted") === "on",
        internalNotes: fd.get("internalNotes"),
      }),
    }).catch(() => null);
    setSaving(false);
    const data = (await res?.json().catch(() => ({}))) as { id?: string; error?: string } | undefined;
    if (!res?.ok) {
      setError(data?.error || "Could not save");
      if (res?.status === 409 && data?.id) setDupId(data.id);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ Add candidate</Button>
      {open ? (
        <Modal open onClose={() => setOpen(false)} size="lg">
          <form onSubmit={onSubmit} className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Add candidate</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass.default} htmlFor="oc-name">Full name *</label>
                <input id="oc-name" name="fullName" required className={inputClass.md} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="oc-phone">Phone</label>
                <input id="oc-phone" name="phone" type="tel" className={inputClass.md} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="oc-email">Email</label>
                <input id="oc-email" name="email" type="email" className={inputClass.md} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="oc-loc">Location</label>
                <input id="oc-loc" name="location" placeholder="City, State" className={inputClass.md} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="oc-sal">Expected salary</label>
                <input id="oc-sal" name="expectedSalary" placeholder="e.g. around 70k" className={inputClass.md} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="oc-stage">Stage</label>
                <select id="oc-stage" name="stage" defaultValue="NEW" className={inputClass.md}>
                  {OFFICE_STAGES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass.default}>Source</label>
                <SearchableSelect
                  className="mt-1"
                  value={source}
                  onChange={setSource}
                  options={HIRING_SOURCES.map((s) => ({ value: s.value, label: s.label }))}
                  placeholder="Where they came from…"
                  allLabel="- None -"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="shortlisted" className="accent-pink-600" />
              Shortlist
            </label>
            <div>
              <label className={labelClass.default} htmlFor="oc-notes">Notes</label>
              <textarea id="oc-notes" name="internalNotes" rows={3} className={inputClass.md} />
            </div>
            {error ? (
              <p className="text-xs text-red-500">
                {error}
                {dupId ? (
                  <>
                    {" "}
                    <a href={`/erp/candidates/${dupId}`} className="underline">Open them</a>
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Add candidate"}</Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
