"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { OPENING_STATUSES, WORK_MODES } from "@/lib/erp/officeHiring";

export type OpeningFormValues = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  workMode: string | null;
  salaryMinCents: number | null;
  salaryMaxCents: number | null;
  status: string;
  hiringManagerEmail: string | null;
  description: string | null;
};

const dollars = (c: number | null) => (c == null ? "" : String(c / 100));

/** Create (no `opening`) or edit an office job opening. */
export function OpeningFormModal({
  open,
  onClose,
  opening,
  managers,
}: {
  open: boolean;
  onClose: () => void;
  opening?: OpeningFormValues;
  managers: string[];
}) {
  const router = useRouter();
  const [hiringManagerEmail, setHiringManagerEmail] = useState(opening?.hiringManagerEmail ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: fd.get("title"),
      department: fd.get("department"),
      location: fd.get("location"),
      workMode: fd.get("workMode"),
      salaryMin: fd.get("salaryMin"),
      salaryMax: fd.get("salaryMax"),
      description: fd.get("description"),
      hiringManagerEmail: hiringManagerEmail || null,
      ...(opening ? { status: fd.get("status") } : {}),
    };
    const res = await fetch(opening ? `/api/erp/job-openings/${opening.id}` : "/api/erp/job-openings", {
      method: opening ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    setSaving(false);
    const data = (await res?.json().catch(() => ({}))) as { id?: string; error?: string } | undefined;
    if (!res?.ok) {
      setError(data?.error || "Could not save");
      return;
    }
    onClose();
    if (!opening && data?.id) router.push(`/erp/candidates/openings/${data.id}`);
    else router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <form onSubmit={onSubmit} className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">{opening ? "Edit opening" : "New opening"}</h2>
        <div>
          <label className={labelClass.default} htmlFor="op-title">Job title *</label>
          <input id="op-title" name="title" required defaultValue={opening?.title ?? ""} placeholder="e.g. Marketing Manager" className={inputClass.md} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass.default} htmlFor="op-dept">Department</label>
            <input id="op-dept" name="department" defaultValue={opening?.department ?? ""} placeholder="e.g. Sales" className={inputClass.md} />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="op-loc">Location</label>
            <input id="op-loc" name="location" defaultValue={opening?.location ?? ""} placeholder="e.g. Philadelphia, PA" className={inputClass.md} />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="op-mode">Work mode</label>
            <select id="op-mode" name="workMode" defaultValue={opening?.workMode ?? ""} className={inputClass.md}>
              <option value="">-</option>
              {WORK_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          {opening ? (
            <div>
              <label className={labelClass.default} htmlFor="op-status">Status</label>
              <select id="op-status" name="status" defaultValue={opening.status} className={inputClass.md}>
                {OPENING_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className={labelClass.default} htmlFor="op-min">Salary min ($/yr)</label>
            <input id="op-min" name="salaryMin" inputMode="numeric" defaultValue={dollars(opening?.salaryMinCents ?? null)} placeholder="65000 or 65k" className={inputClass.md} />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="op-max">Salary max ($/yr)</label>
            <input id="op-max" name="salaryMax" inputMode="numeric" defaultValue={dollars(opening?.salaryMaxCents ?? null)} placeholder="80000 or 80k" className={inputClass.md} />
          </div>
        </div>
        <div>
          <label className={labelClass.default}>Hiring manager</label>
          <SearchableSelect
            className="mt-1"
            value={hiringManagerEmail}
            onChange={setHiringManagerEmail}
            options={managers.map((m) => ({ value: m, label: m }))}
            placeholder="Search people…"
            allLabel="- None -"
          />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="op-desc">Notes</label>
          <textarea id="op-desc" name="description" rows={3} defaultValue={opening?.description ?? ""} placeholder="What we're looking for, link to the job ad…" className={inputClass.md} />
        </div>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : opening ? "Save" : "Create opening"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function NewOpeningButton({ managers }: { managers: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ New opening</Button>
      {open ? <OpeningFormModal open onClose={() => setOpen(false)} managers={managers} /> : null}
    </>
  );
}

export function EditOpeningButton({ opening, managers }: { opening: OpeningFormValues; managers: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Edit opening</Button>
      {open ? <OpeningFormModal open onClose={() => setOpen(false)} opening={opening} managers={managers} /> : null}
    </>
  );
}

/** Only shown while the opening has no candidates (the API refuses otherwise). */
export function DeleteOpeningButton({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  async function onDelete() {
    if (!(await confirm({ message: "Delete this opening and its job ads?" }))) return;
    const res = await fetch(`/api/erp/job-openings/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      toast(j?.error || "Could not delete", "error");
      return;
    }
    router.push("/erp/candidates?track=office");
  }
  return (
    <Button size="sm" variant="danger" onClick={() => void onDelete()}>Delete</Button>
  );
}
