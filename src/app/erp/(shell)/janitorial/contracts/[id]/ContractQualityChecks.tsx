"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { addDaysKey } from "@/lib/erp/managementCalendar";
import { MAX_AREAS } from "@/lib/erp/janitorialQualityShared";

const input = inputClass.md;
const label = labelClass.default;

export type QualityCheckRow = {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  assignedUserId: string | null;
  assigneeName: string;
  status: "SCHEDULED" | "DONE";
  notes: string | null;
  completedAt: string | null;
  /** Areas marked Needs attention on the visit */
  attentionAreas: string[];
  /** Visit form saved but not finished */
  started: boolean;
  summarySent: boolean;
};

type Form = { kind: "new" } | { kind: "edit"; check: QualityCheckRow };

const formatDay = (key: string) =>
  new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Quality tab: schedule visits one at a time, mark them done, move or cancel them. */
export function ContractQualityChecks({
  contractId,
  checks,
  checkers,
  today,
  keyAreas,
  usingServiceAreas,
}: {
  contractId: string;
  checks: QualityCheckRow[];
  checkers: { id: string; name: string }[];
  today: string;
  keyAreas: string[];
  /** No key areas saved yet; keyAreas came from the contract's Service areas */
  usingServiceAreas: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  const upcoming = checks.filter((c) => c.status === "SCHEDULED").sort((a, b) => a.date.localeCompare(b.date));
  const past = checks.filter((c) => c.status === "DONE").sort((a, b) => b.date.localeCompare(a.date));

  async function send(url: string, method: string, body?: unknown, success?: string) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "Something went wrong", "error");
        return false;
      }
      if (success) toast(success, "success");
      router.refresh();
      return true;
    } catch {
      toast("Network error", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function cancel(check: QualityCheckRow) {
    const ok = await confirm({
      title: "Cancel this quality check?",
      message: `The check on ${formatDay(check.date)} will be removed from the calendar.`,
      confirmLabel: "Cancel check",
    });
    if (ok) await send(`/api/erp/janitorial/quality-checks/${check.id}`, "DELETE", undefined, "Check cancelled");
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            Quality checks
            <InfoTip text="A project manager or admin visits, checks the key areas (bathrooms, lobby...), talks with the property manager, and gives the team updates. Checks show on the Management calendar." />
          </h2>
          <p className="text-xs text-gray-500">
            {upcoming.length === 0 ? "Nothing scheduled." : `${upcoming.length} scheduled.`}
            {past[0] ? ` Last done ${formatDay(past[0].date)}.` : ""}
          </p>
        </div>
        <Button size="sm" onClick={() => setForm({ kind: "new" })}>
          Schedule a check
        </Button>
      </div>

      {upcoming.length > 0 && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {upcoming.map((c) => {
            const overdue = c.date < today;
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {formatDay(c.date)}
                    {overdue && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Overdue</span>}
                    {c.date === today && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Today</span>}
                  </p>
                  <p className="text-sm text-gray-600">
                    {c.assigneeName}
                    {c.notes ? <span className="text-gray-400"> · {c.notes}</span> : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/erp/janitorial/quality-checks/${c.id}`}
                    className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500"
                  >
                    {c.started ? "Continue check" : "Start check"}
                  </Link>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => setForm({ kind: "edit", check: c })}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => cancel(c)}>
                    Cancel
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-gray-500">Done</h3>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {past.map((c) => (
              <li key={c.id}>
                <Link href={`/erp/janitorial/quality-checks/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50">
                  <span className="text-sm text-gray-700">
                    <span className="font-medium">{formatDay(c.date)}</span>
                    <span className="text-gray-500"> · {c.assigneeName}</span>
                  </span>
                  <span className="ml-auto text-xs text-gray-400">{c.summarySent ? "Summary sent" : "Summary not sent"}</span>
                  {c.attentionAreas.length ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title={c.attentionAreas.join(", ")}>
                      {c.attentionAreas.length} need{c.attentionAreas.length === 1 ? "s" : ""} attention
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">All good</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <KeyAreasEditor contractId={contractId} initial={keyAreas} usingServiceAreas={usingServiceAreas} />

      {form && (
        <CheckDialog
          form={form}
          checkers={checkers}
          defaultDate={addDaysKey(today, 7)}
          busy={busy}
          onClose={() => setForm(null)}
          onSave={async (values) => {
            const ok =
              form.kind === "new"
                ? await send(`/api/erp/janitorial/contracts/${contractId}/quality-checks`, "POST", values, "Check scheduled")
                : await send(`/api/erp/janitorial/quality-checks/${form.check.id}`, "PATCH", values, "Check updated");
            if (ok) setForm(null);
          }}
        />
      )}
    </section>
  );
}

function CheckDialog({
  form,
  checkers,
  defaultDate,
  busy,
  onClose,
  onSave,
}: {
  form: Form;
  checkers: { id: string; name: string }[];
  defaultDate: string;
  busy: boolean;
  onClose: () => void;
  onSave: (values: { date: string; assignedUserId: string; notes: string }) => void;
}) {
  const existing = form.kind === "edit" ? form.check : null;
  const [date, setDate] = useState(existing?.date ?? defaultDate);
  const [assignedUserId, setAssignedUserId] = useState(existing?.assignedUserId ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return setError("Pick a date");
    if (!assignedUserId) return setError("Pick who is doing the check");
    setError("");
    onSave({ date, assignedUserId, notes });
  }

  return (
    <Modal open onClose={onClose} size="md">
      <form onSubmit={submit} className="space-y-3">
        <h3 className="text-base font-semibold text-gray-900">{existing ? "Edit quality check" : "Schedule a quality check"}</h3>
        <div>
          <label className={label} htmlFor="qc-date">Date *</label>
          <input id="qc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="qc-who">
            <span className="inline-flex items-center gap-1">
              Who is doing it *
              <InfoTip text="Admins and Project Managers. They get an email when assigned and again the day before." />
            </span>
          </label>
          <SearchableSelect
            id="qc-who"
            value={assignedUserId}
            onChange={setAssignedUserId}
            options={checkers.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Search admins and PMs…"
            allLabel="Pick someone"
            className="mt-1"
          />
        </div>
        <div>
          <label className={label} htmlFor="qc-notes">Notes</label>
          <input id="qc-notes" type="text" placeholder="e.g. Focus on the gym bathrooms" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Saving…" : existing ? "Save" : "Schedule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The building's list of areas every visit checks. */
function KeyAreasEditor({ contractId, initial, usingServiceAreas }: { contractId: string; initial: string[]; usingServiceAreas: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [areas, setAreas] = useState(initial);
  const [newArea, setNewArea] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const change = (next: string[]) => {
    setAreas(next);
    setDirty(true);
  };
  function add() {
    const a = newArea.trim();
    if (!a || areas.some((x) => x.toLowerCase() === a.toLowerCase()) || areas.length >= MAX_AREAS) return;
    change([...areas, a]);
    setNewArea("");
  }
  function move(i: number, by: number) {
    const j = i + by;
    if (j < 0 || j >= areas.length) return;
    const next = [...areas];
    [next[i], next[j]] = [next[j]!, next[i]!];
    change(next);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/janitorial/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qualityAreas: areas }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "Could not save", "error");
        return;
      }
      setDirty(false);
      toast("Key areas saved", "success");
      router.refresh();
    } catch {
      toast("Network error", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
          Key areas
          <InfoTip text="Checked on every visit, in this order. Changes apply to checks not started yet." />
        </h3>
        {usingServiceAreas && areas.length > 0 && !dirty && (
          <p className="text-xs text-amber-700">Taken from Service areas. Adjust and save to set this building&apos;s list.</p>
        )}
      </div>
      {areas.length === 0 ? (
        <p className="text-sm text-gray-500">No areas yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
          {areas.map((a, i) => (
            <li key={a} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-800">
              <span className="min-w-0 flex-1 truncate">{a}</span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${a} up`} className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === areas.length - 1}
                aria-label={`Move ${a} down`}
                className="px-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
              >
                ↓
              </button>
              <button type="button" onClick={() => change(areas.filter((_, j) => j !== i))} aria-label={`Remove ${a}`} className="px-1 text-gray-400 hover:text-red-600">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newArea}
          onChange={(e) => setNewArea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="e.g. Lobby, Gym bathrooms, Trash room"
          aria-label="New key area"
          className={inputClass.xs + " flex-1"}
        />
        <Button variant="secondary" size="sm" onClick={add} disabled={!newArea.trim()}>
          Add
        </Button>
        <Button size="sm" onClick={save} disabled={saving || (!dirty && !usingServiceAreas)}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
