"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, inputClass, labelClass, useToast } from "@/app/erp/components/ui";
import { HubSpotDocumentsSection } from "@/app/erp/components/HubSpotDocumentsSection";
import { centsToDollars } from "@/lib/erp/money";
import {
  DISMISS_REASONS,
  DISMISS_REASON_LABELS,
  OLD_UNPAID_KIND_LABELS,
  type CleanupInvoice,
  type DismissReason,
  type InvoiceCleanup,
  type OldUnpaidRow,
} from "@/lib/erp/invoiceCleanupShared";

/**
 * The invoice cleanup page as one to-do list: a card per job whose old work
 * still shows unpaid, or that has a paid invoice nobody attached. Each card
 * asks one question. Invoices with nothing to fix and ones we can't place
 * sit folded at the bottom.
 */

function day(key: string | null): string {
  if (!key) return "-";
  return new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** centsToDollars already has the $ */
const money = (cents: number | null) => (cents == null ? "-" : centsToDollars(cents));

async function post(body: Record<string, unknown>): Promise<{ error: string | null; lines: number }> {
  const res = await fetch("/api/erp/invoice-cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = (await res?.json().catch(() => ({}))) as { error?: string; lines?: number } | undefined;
  if (res?.ok) return { error: null, lines: j?.lines ?? 0 };
  return { error: j?.error ?? "Couldn't save. Try again.", lines: 0 };
}

type Job = {
  key: string;
  title: string;
  href: string;
  /** Old unpaid lines with no invoice */
  rows: OldUnpaidRow[];
  /** Paid invoices on this job's HubSpot deal not attached to anything */
  invoices: CleanupInvoice[];
  cents: number;
};

function buildJobs(data: InvoiceCleanup): Job[] {
  const jobs = new Map<string, Job>();
  const get = (key: string, title: string, href: string) => {
    const j = jobs.get(key) ?? { key, title, href, rows: [], invoices: [], cents: 0 };
    jobs.set(key, j);
    return j;
  };
  for (const r of data.oldUnpaid) {
    const j = get(r.groupKey, r.title, r.groupHref);
    j.rows.push(r);
    j.cents += r.cents ?? 0;
  }
  for (const inv of data.unlinked) {
    if (inv.workState !== "HAS_UNPAID" || !inv.linkTarget) continue;
    get(`${inv.linkTarget.scope === "project" ? "p" : "b"}:${inv.linkTarget.id}`, inv.title, inv.href).invoices.push(inv);
  }
  // Jobs with an invoice to attach first (quickest to fix), then the most money
  return [...jobs.values()].sort((a, b) => Number(b.invoices.length > 0) - Number(a.invoices.length > 0) || b.cents - a.cents);
}

type Dialog =
  | { kind: "link"; invoice: CleanupInvoice }
  | { kind: "dismiss"; ids: string[]; label: string; suggested: DismissReason | null }
  | { kind: "paid" | "void"; job: Job; rows: OldUnpaidRow[] };

export function CleanupBoard({ data }: { data: InvoiceCleanup }) {
  const router = useRouter();
  const toast = useToast();
  const jobs = useMemo(() => buildJobs(data), [data]);
  const nothingToFix = data.unlinked.filter((i) => i.workState === "ALL_PAID");
  const noJob = data.unlinked.filter((i) => i.workState === "NO_JOB");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);

  const done = (message: string) => {
    toast(message);
    setDialog(null);
    router.refresh();
  };

  async function clearAll() {
    setBusy(true);
    const r = await post({ action: "dismiss", hubspotInvoiceIds: nothingToFix.map((i) => i.hubspotInvoiceId), reason: "ALREADY_PAID" });
    setBusy(false);
    if (r.error) toast(r.error, "error");
    else done(`Cleared ${nothingToFix.length} invoices.`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* What to do */}
      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Jobs to check</h2>
          <span className="text-sm text-gray-500">{jobs.length === 0 ? "All done" : `${jobs.length} left`}</span>
        </div>
        <p className="mt-1 text-sm text-gray-600">Each job below still shows unpaid in the ERP. Answer one question per job and it leaves the list.</p>

        {jobs.length === 0 ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-5 py-4 text-sm text-emerald-800">Nothing left to check. Old work is all paid, billed with an invoice, or voided.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {jobs.map((j) => (
              <JobCard key={j.key} job={j} onDialog={setDialog} />
            ))}
          </ul>
        )}
      </section>

      {/* Folded extras */}
      <section className="space-y-3">
        {nothingToFix.length > 0 && (
          <Fold
            title={`${nothingToFix.length} paid invoices with nothing to fix`}
            hint="Their jobs are already marked Paid in the ERP, so there's nothing to attach them to. Clearing just takes them off the to-do lists."
            action={
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void clearAll()}>
                {busy ? "Clearing…" : "Clear all"}
              </Button>
            }
          >
            <InvoiceRows invoices={nothingToFix} />
          </Fold>
        )}
        {noJob.length > 0 && (
          <Fold title={`${noJob.length} paid invoices we can't match to a job`} hint="Their HubSpot deal isn't tied to any project or building in the ERP. Clear them, with a note if it helps.">
            <InvoiceRows
              invoices={noJob}
              action={(inv) => (
                <Button size="xs" variant="ghost" onClick={() => setDialog({ kind: "dismiss", ids: [inv.hubspotInvoiceId], label: inv.number ?? "this invoice", suggested: "NOT_IN_ERP" })}>
                  Clear
                </Button>
              )}
            />
          </Fold>
        )}
        {data.dismissed.length > 0 && (
          <Fold title={`${data.dismissed.length} cleared earlier`} hint="Put one back on the list with Undo.">
            <ul className="divide-y divide-gray-100">
              {data.dismissed.map((d) => (
                <li key={d.hubspotInvoiceId} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 font-medium text-gray-900">{d.number ?? "No number"}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-600">
                    {d.title} · {DISMISS_REASON_LABELS[d.reason].label}
                    {d.note ? `: ${d.note}` : ""} · {d.byName ?? "?"}, {day(d.atKey)}
                  </span>
                  <span className="tabular-nums text-gray-700">{money(d.amountCents)}</span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      const r = await post({ action: "undo", hubspotInvoiceIds: [d.hubspotInvoiceId] });
                      if (r.error) toast(r.error, "error");
                      else done(`${d.number ?? "Invoice"} is back.`);
                    }}
                  >
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          </Fold>
        )}
        {data.quickBooksSynced && data.notInQuickBooks > 0 && (
          <p className="px-1 text-sm text-gray-500">
            For the bookkeeper: {data.notInQuickBooks} open invoices never reached QuickBooks, so customers can&apos;t pay them there.{" "}
            <a href="/erp/quickbooks/check" className="font-medium text-pink-600 hover:underline">
              See which
            </a>
          </p>
        )}
      </section>

      {dialog?.kind === "link" && <LinkDialog invoice={dialog.invoice} onClose={() => (setDialog(null), router.refresh())} />}
      {dialog?.kind === "dismiss" && (
        <DismissDialog
          label={dialog.label}
          suggested={dialog.suggested}
          onClose={() => setDialog(null)}
          onSave={async (reason, note) => {
            const r = await post({ action: "dismiss", hubspotInvoiceIds: dialog.ids, reason, note });
            if (!r.error) done("Cleared.");
            return r.error;
          }}
        />
      )}
      {(dialog?.kind === "paid" || dialog?.kind === "void") && (
        <ResolveDialog
          kind={dialog.kind}
          job={dialog.job}
          rows={dialog.rows}
          onClose={() => setDialog(null)}
          onDone={(lines) => done(`${dialog.kind === "paid" ? "Marked Paid" : "Voided"}: ${lines} line${lines === 1 ? "" : "s"} on ${dialog.job.title}.`)}
        />
      )}
    </div>
  );
}

// ── A job ──────────────────────────────────────────────────────────────────

function JobCard({ job, onDialog }: { job: Job; onDialog: (d: Dialog) => void }) {
  const [showLines, setShowLines] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(job.rows.map((r) => r.key)));
  const rows = job.rows.filter((r) => picked.has(r.key));
  const some = rows.length < job.rows.length;
  const first = job.rows.reduce((m, r) => (!m || r.doneKey < m ? r.doneKey : m), "");
  const last = job.rows.reduce((m, r) => (r.doneKey > m ? r.doneKey : m), "");
  const toggle = (key: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  // What's unpaid, in a few words
  const summary =
    job.rows.length === 0
      ? `${job.invoices[0].unpaidCount} unpaid ${job.invoices[0].unpaidCount === 1 ? "item" : "items"}: ${job.invoices[0].unpaid.slice(0, 3).join(", ")}${job.invoices[0].unpaidCount > 3 ? "…" : ""}`
      : job.rows.length === 1
        ? `${job.rows[0].kind === "PROJECT" ? "The whole job" : job.rows[0].detail}, finished ${day(first)}`
        : `${job.rows.length} items finished ${first === last ? day(first) : `${day(first)} to ${day(last)}`}`;

  return (
    <li className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div className="min-w-0">
          <a href={job.href} className="text-base font-semibold text-gray-900 hover:text-pink-600">
            {job.title}
          </a>
          <p className="mt-0.5 text-sm text-gray-500">{summary}</p>
        </div>
        {job.cents > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-base font-semibold tabular-nums text-gray-900">{money(job.cents)}</div>
            <div className="text-xs text-gray-400">unpaid in the ERP</div>
          </div>
        )}
      </div>

      {job.rows.length > 1 && (
        <div className="px-5 pt-2">
          <button type="button" onClick={() => setShowLines((s) => !s)} className="text-sm text-pink-600 hover:underline">
            {showLines ? "Hide the items" : "See the items"}
            {some ? ` (${rows.length} of ${job.rows.length} picked)` : ""}
          </button>
          {showLines && (
            <ul className="mt-2 space-y-1.5 rounded-lg bg-gray-50 p-3 text-sm">
              {job.rows.map((r) => (
                <li key={r.key}>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input type="checkbox" checked={picked.has(r.key)} onChange={() => toggle(r.key)} />
                    <span className="min-w-0 flex-1 truncate text-gray-800">{r.detail}</span>
                    <span className="text-xs text-gray-400">{day(r.doneKey)}</span>
                    <span className="w-24 text-right tabular-nums text-gray-700">{money(r.cents)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3 border-t border-gray-100 px-5 py-4">
        {job.invoices.map((inv) => (
          <div key={inv.hubspotInvoiceId} className="rounded-lg bg-emerald-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 text-sm text-emerald-900">
                <span className="font-semibold">Paid invoice found: {inv.number ?? "no number"}</span>, {money(inv.amountCents)}, dated {day(inv.invoiceDateKey)}.
                <span className="block text-emerald-800/80">
                  {inv.lines
                    .slice(0, 2)
                    .map((l) => l.text)
                    .join("; ")}
                  {inv.lines.length > 2 ? "…" : ""}
                </span>
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onDialog({ kind: "link", invoice: inv })}>
                  Attach to the work
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onDialog({ kind: "dismiss", ids: [inv.hubspotInvoiceId], label: inv.number ?? "this invoice", suggested: null })}>
                  Not for this
                </Button>
              </div>
            </div>
          </div>
        ))}

        {job.rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium text-gray-700">
              {job.invoices.length ? "No invoice for it? " : ""}
              {some ? `The ${rows.length} picked:` : "What happened?"}
            </span>
            <Button size="sm" variant="secondary" disabled={rows.length === 0} onClick={() => onDialog({ kind: "paid", job, rows })}>
              It was paid
            </Button>
            <Button size="sm" variant="secondary" disabled={rows.length === 0} onClick={() => onDialog({ kind: "void", job, rows })}>
              Won&apos;t be billed
            </Button>
            <a href={job.rows[0].billingHref} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Still needs billing
            </a>
          </div>
        )}
      </div>
    </li>
  );
}

// ── Folded sections ────────────────────────────────────────────────────────

function Fold({ title, hint, action, children }: { title: string; hint: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3">
        <span className="text-gray-400 transition-transform group-open:rotate-90">›</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-900">{title}</span>
          <span className="block text-xs text-gray-500">{hint}</span>
        </span>
        {action && <span onClick={(e) => e.preventDefault()}>{action}</span>}
      </summary>
      <div className="border-t border-gray-100 px-5 py-2">{children}</div>
    </details>
  );
}

function InvoiceRows({ invoices, action }: { invoices: CleanupInvoice[]; action?: (inv: CleanupInvoice) => React.ReactNode }) {
  return (
    <ul className="divide-y divide-gray-100">
      {invoices.map((inv) => (
        <li key={inv.hubspotInvoiceId} className="flex items-center gap-3 py-2 text-sm">
          <span className="w-24 shrink-0 font-medium text-gray-900">{inv.number ?? "No number"}</span>
          <span className="w-28 shrink-0 text-gray-500">{day(inv.invoiceDateKey)}</span>
          <span className="min-w-0 flex-1 truncate text-gray-600" title={inv.lines.map((l) => l.text).join("\n")}>
            {inv.title}
          </span>
          <span className="tabular-nums text-gray-700">{money(inv.amountCents)}</span>
          {action?.(inv)}
        </li>
      ))}
    </ul>
  );
}

// ── Dialogs ────────────────────────────────────────────────────────────────

function LinkDialog({ invoice, onClose }: { invoice: CleanupInvoice; onClose: () => void }) {
  if (!invoice.linkTarget) return null;
  return (
    <Modal open size="lg" onClose={onClose}>
      <h3 className="text-base font-semibold text-gray-900">Attach {invoice.number ?? "the invoice"} to the work it paid</h3>
      <p className="mt-1 text-sm text-gray-500">Find {invoice.number ?? "it"} below, click Link, and tick what it paid for. Those turn Paid with the invoice&apos;s date. Close this when you&apos;re done.</p>
      <div className="mt-3 max-h-[70vh] overflow-y-auto">
        <HubSpotDocumentsSection
          endpoint={`/api/erp/${invoice.linkTarget.scope === "project" ? "projects" : "buildings"}/${invoice.linkTarget.id}/hubspot-documents`}
          noDealMessage="No HubSpot deal is linked here."
          invoicesInfo="Read live from the HubSpot deal."
        />
      </div>
    </Modal>
  );
}

function DismissDialog({ label, suggested, onClose, onSave }: { label: string; suggested: DismissReason | null; onClose: () => void; onSave: (reason: DismissReason, note: string) => Promise<string | null> }) {
  const [reason, setReason] = useState<DismissReason | null>(suggested);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose}>
      <h3 className="text-base font-semibold text-gray-900">Clear {label}</h3>
      <p className="mt-1 text-sm text-gray-500">It comes off the list. Nothing changes in HubSpot or QuickBooks, and you can undo it.</p>
      <div className="mt-3 space-y-2">
        {DISMISS_REASONS.map((r) => (
          <label key={r} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="reason" className="mt-1" checked={reason === r} onChange={() => setReason(r)} />
            <span>
              <span className="font-medium text-gray-900">{DISMISS_REASON_LABELS[r].label}</span>
              <span className="block text-xs text-gray-500">{DISMISS_REASON_LABELS[r].hint}</span>
            </span>
          </label>
        ))}
        <label className={labelClass.default} htmlFor="dismiss-note">
          Note {reason === "OTHER" ? "(required)" : "(optional)"}
        </label>
        <textarea id="dismiss-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass.md} />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!reason || (reason === "OTHER" && !note.trim()) || saving}
          onClick={async () => {
            if (!reason) return;
            setSaving(true);
            setError(await onSave(reason, note));
            setSaving(false);
          }}
        >
          {saving ? "Saving…" : "Clear it"}
        </Button>
      </div>
    </Modal>
  );
}

const VOID_PICKS = ["Duplicate of another project", "Billed on another invoice", "Work was cancelled", "No charge (warranty or free)"];

function ResolveDialog({ kind, job, rows, onClose, onDone }: { kind: "paid" | "void"; job: Job; rows: OldUnpaidRow[]; onClose: () => void; onDone: (lines: number) => void }) {
  const latest = rows.reduce((m, r) => (r.doneKey > m ? r.doneKey : m), "");
  const [paidOn, setPaidOn] = useState(latest);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = rows.reduce((s, r) => s + (r.cents ?? 0), 0);
  const ok = kind === "paid" ? !!paidOn : reason.trim().length >= 3;
  const what = rows.length === 1 ? (rows[0].kind === "PROJECT" ? "the whole job" : rows[0].detail) : `${rows.length} items`;

  async function save() {
    setSaving(true);
    const keys = rows.map((r) => r.key);
    const r = await post(kind === "paid" ? { action: "paid", keys, paidOn } : { action: "void", keys, note: reason });
    setSaving(false);
    if (r.error) setError(r.error);
    else onDone(r.lines);
  }

  return (
    <Modal open onClose={onClose}>
      <h3 className="text-base font-semibold text-gray-900">{kind === "paid" ? "When was it paid?" : "Why won't it be billed?"}</h3>
      <p className="mt-1 text-sm text-gray-600">
        {job.title}: {what}, {money(total)}
        {rows.length > 1 ? ` (${rows.map((r) => OLD_UNPAID_KIND_LABELS[r.kind]).filter((v, i, a) => a.indexOf(v) === i).join(", ")})` : ""}
      </p>
      {kind === "paid" ? (
        <div className="mt-3">
          <input type="date" aria-label="Paid on" id="paid-on" value={paidOn} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaidOn(e.target.value)} className={inputClass.md} />
          <p className="mt-1 text-xs text-gray-500">Finance counts the money in this month. It starts at the day the work finished; use the day the payment came in if you know it.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {VOID_PICKS.map((p) => (
              <button key={p} type="button" onClick={() => setReason(p)} className={`rounded-full px-2.5 py-1 text-xs ring-1 ${reason === p ? "bg-pink-600 text-white ring-pink-600" : "bg-white text-gray-700 ring-gray-300 hover:bg-gray-50"}`}>
                {p}
              </button>
            ))}
          </div>
          <textarea id="void-reason" aria-label="Reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Or type the reason" className={inputClass.md} />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant={kind === "void" ? "danger" : "primary"} disabled={!ok || saving} onClick={() => void save()}>
          {saving ? "Saving…" : kind === "paid" ? "Mark Paid" : "Void it"}
        </Button>
      </div>
    </Modal>
  );
}
