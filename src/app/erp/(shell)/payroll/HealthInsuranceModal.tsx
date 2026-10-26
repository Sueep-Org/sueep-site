"use client";

import { useEffect, useState } from "react";
import { Button, InfoTip, Modal, useConfirm, useToast } from "@/app/erp/components/ui";
import { EmployeeCombobox, type EmployeeOption } from "@/app/erp/components/EmployeeCombobox";

type Coverage = {
  id: string;
  personName: string;
  employeeId: string | null;
  employeeName: string | null;
  monthlyPremiumCents: number;
  startDate: string;
  endDate: string | null;
};

type Action =
  | { kind: "add" }
  | { kind: "price"; row: Coverage }
  | { kind: "end"; row: Coverage }
  | { kind: "link"; row: Coverage };

const inputCls = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function firstOfThisMonth(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

export function HealthInsuranceModal({
  open, onClose, onSaved, employees,
}: { open: boolean; onClose: () => void; onSaved: () => void; employees: EmployeeOption[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Coverage[] | null>(null);
  const [sharePct, setSharePct] = useState(25);
  const [shareDraft, setShareDraft] = useState("25");
  const [canEdit, setCanEdit] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [form, setForm] = useState({ personName: "", employeeId: "", premium: "", date: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoadError("");
    fetch("/api/erp/health-coverage")
      .then((r) => r.json())
      .then((d: { coverages?: Coverage[]; sharePct?: number; canEdit?: boolean; error?: string }) => {
        if (!d.coverages) { setLoadError(d.error ?? "Could not load health insurance"); return; }
        setRows(d.coverages);
        setSharePct(d.sharePct ?? 25);
        setShareDraft(String(d.sharePct ?? 25));
        setCanEdit(!!d.canEdit);
      })
      .catch(() => setLoadError("Could not load health insurance"));
  }, [open, reload]);

  function start(next: Action) {
    setError("");
    if (next.kind === "add") setForm({ personName: "", employeeId: "", premium: "", date: firstOfThisMonth() });
    if (next.kind === "price") setForm({ personName: "", employeeId: "", premium: String(next.row.monthlyPremiumCents / 100), date: firstOfThisMonth() });
    if (next.kind === "end") setForm({ personName: "", employeeId: "", premium: "", date: new Date().toISOString().slice(0, 10) });
    if (next.kind === "link") setForm({ personName: next.row.personName, employeeId: next.row.employeeId ?? "", premium: "", date: "" });
    setAction(next);
  }

  async function send(method: string, body: unknown, url = "/api/erp/health-coverage"): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const result = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(result.error ?? "Could not save"); return false; }
      setReload((k) => k + 1);
      onSaved();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function submitAction() {
    if (!action) return;
    let ok = false;
    if (action.kind === "add") {
      ok = await send("POST", { personName: form.personName, employeeId: form.employeeId || null, monthlyPremium: form.premium, startDate: form.date });
    } else if (action.kind === "price") {
      ok = await send("PATCH", { id: action.row.id, newPremium: form.premium, changeFrom: form.date });
    } else if (action.kind === "end") {
      ok = await send("PATCH", { id: action.row.id, endDate: form.date });
    } else {
      ok = await send("PATCH", { id: action.row.id, personName: form.personName, employeeId: form.employeeId || null });
    }
    if (ok) { toast("Health insurance saved.", "success"); setAction(null); }
  }

  async function saveShare() {
    if (await send("PUT", { sharePct: shareDraft })) toast("Company share saved.", "success");
  }

  async function remove(row: Coverage) {
    const ok = await confirm({ message: `Remove ${row.personName}'s ${money(row.monthlyPremiumCents)} line? Only for a line added by mistake. If they left the plan, end their coverage instead so past months still count.` });
    if (ok) await send("DELETE", null, `/api/erp/health-coverage?id=${row.id}`);
  }

  const current = (rows ?? []).filter((r) => !r.endDate || r.endDate >= new Date().toISOString().slice(0, 10));
  const past = (rows ?? []).filter((r) => !current.includes(r));
  const currentTotal = current.reduce((s, r) => s + r.monthlyPremiumCents, 0);

  function rowLine(r: Coverage, ended: boolean) {
    return (
      <li key={r.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${ended ? "text-gray-400" : ""}`}>
        <div className="min-w-0">
          <p className={`text-sm font-medium ${ended ? "text-gray-400" : "text-gray-900"}`}>
            {r.personName}
            {!r.employeeId ? <span className="ml-1.5 text-[10px] font-normal text-gray-400">no employee profile</span> : null}
          </p>
          <p className="text-[11px] text-gray-500">
            From {shortDate(r.startDate)}{r.endDate ? ` to ${shortDate(r.endDate)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-right text-sm tabular-nums">
            {money(r.monthlyPremiumCents)}
            <span className="block text-[10px] text-gray-500">Sueep {money(Math.round((r.monthlyPremiumCents * sharePct) / 100))}</span>
          </span>
          {canEdit && !ended ? (
            <span className="flex gap-2 text-[11px]">
              <button type="button" onClick={() => start({ kind: "price", row: r })} className="text-gray-500 hover:text-pink-600">Price</button>
              <button type="button" onClick={() => start({ kind: "link", row: r })} className="text-gray-500 hover:text-pink-600">Edit</button>
              <button type="button" onClick={() => start({ kind: "end", row: r })} className="text-gray-500 hover:text-pink-600">End</button>
              <button type="button" onClick={() => remove(r)} className="text-gray-500 hover:text-red-600">Remove</button>
            </span>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div>
          <h2 className="flex items-center gap-1 text-base font-semibold text-gray-900">
            Health insurance
            <InfoTip text="Each person's full monthly premium from the Independence Blue Cross bill. Sueep pays its share; the rest comes out of their check through ADP. Sueep's share counts on Finance and on their Payroll row." />
          </h2>
          {!canEdit && rows ? <p className="mt-1 text-xs text-gray-500">Only an Admin can change these.</p> : null}
        </div>

        {!rows ? (
          <p className="text-sm text-gray-400">{loadError || "Loading…"}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <label className="block text-xs font-medium text-gray-600">
                Sueep pays (%)
                <input type="number" min="0" max="100" step="1" disabled={!canEdit} value={shareDraft}
                  onChange={(e) => setShareDraft(e.target.value)} className={`${inputCls} w-24`} />
              </label>
              {canEdit && shareDraft !== String(sharePct) ? (
                <Button size="xs" type="button" onClick={saveShare} disabled={saving}>Save</Button>
              ) : null}
              <p className="ml-auto text-right text-xs text-gray-600 tabular-nums">
                Bill {money(currentTotal)}/mo
                <span className="block font-semibold text-gray-900">Sueep {money(Math.round((currentTotal * sharePct) / 100))}/mo</span>
              </p>
            </div>

            <ul className="divide-y divide-gray-100">
              {current.length === 0 ? <li className="py-3 text-sm text-gray-400">No one on the plan yet.</li> : current.map((r) => rowLine(r, false))}
            </ul>
            {past.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">Ended or old prices ({past.length})</summary>
                <ul className="divide-y divide-gray-100">{past.map((r) => rowLine(r, true))}</ul>
              </details>
            ) : null}

            {canEdit && !action ? (
              <Button size="sm" type="button" onClick={() => start({ kind: "add" })}>Add person</Button>
            ) : null}

            {action ? (
              <form className="space-y-3 rounded-md border border-gray-200 p-3" onSubmit={(e) => { e.preventDefault(); submitAction(); }}>
                <p className="text-sm font-medium text-gray-900">
                  {action.kind === "add" ? "Add person" : action.kind === "price" ? `New price for ${action.row.personName}` : action.kind === "end" ? `End ${action.row.personName}'s coverage` : `Edit ${action.row.personName}`}
                </p>
                {action.kind === "add" || action.kind === "link" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-gray-600">
                      Name
                      <input required value={form.personName} onChange={(e) => setForm((f) => ({ ...f, personName: e.target.value }))} className={inputCls} />
                    </label>
                    <div className="text-xs font-medium text-gray-600">
                      <span className="flex items-center gap-1">Employee <span className="font-normal text-gray-400">(optional)</span>
                        <InfoTip text="Link their employee profile so their share shows on their Payroll row. Leave empty for an owner with no profile." />
                      </span>
                      <EmployeeCombobox employees={employees} value={form.employeeId}
                        onChange={(id) => setForm((f) => ({ ...f, employeeId: id, personName: f.personName || employees.find((e) => e.id === id)?.name || "" }))} />
                    </div>
                  </div>
                ) : null}
                {action.kind === "add" || action.kind === "price" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs font-medium text-gray-600">
                      Monthly premium, full bill ($)
                      <input type="number" required min="0.01" step="0.01" value={form.premium} onChange={(e) => setForm((f) => ({ ...f, premium: e.target.value }))} className={inputCls} />
                    </label>
                    <label className="block text-xs font-medium text-gray-600">
                      {action.kind === "add" ? "Covered from" : "New price starts"}
                      <input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputCls} />
                    </label>
                  </div>
                ) : null}
                {action.kind === "end" ? (
                  <label className="block text-xs font-medium text-gray-600">
                    Last covered day
                    <input type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={`${inputCls} sm:w-48`} />
                  </label>
                ) : null}
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAction(null)} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                  <Button size="sm" type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                </div>
              </form>
            ) : error ? <p className="text-xs text-red-600">{error}</p> : null}
          </>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Close</button>
        </div>
      </div>
    </Modal>
  );
}
