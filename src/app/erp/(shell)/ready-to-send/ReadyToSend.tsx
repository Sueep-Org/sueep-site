"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { centsToDollars, parseMoneyInput } from "@/lib/erp/money";
import type { DraftLine } from "@/lib/hubspot/invoiceDrafts";

/** Who an emailed draft goes to, and the contacts Edit recipients offers. */
export type DraftRecipientsRow = {
  to: string[];
  cc: string[];
  /** e.g. "UDR billing settings" or "Set on this invoice" */
  from: string | null;
  /** Set on this draft, so it can go back to the billing settings */
  set: boolean;
  contacts: { name: string; role: string | null; email: string; from: "Company" | "Job" }[];
  /** For "Also use for future invoices to this building" */
  groupLabel: "building" | "job";
};

export type MonthRow = { periodId: string; building: string; month: string; note: string | null; discardedBy: string | null };

export type DraftRow = MonthRow & {
  /**
   * month: a janitorial month (periodId). items: picked finished work (rowId
   * is the ItemInvoiceDraft id). qbo: a draft for QuickBooks (QboInvoiceDraft id).
   */
  kind: "month" | "items" | "qbo";
  rowId: string;
  hubspotInvoiceId: string | null;
  invoiceDateKey: string;
  dueDate: string | null;
  lines: DraftLine[];
  amountCents: number;
  charges: { description: string; amountCents: number }[];
  /** What the ERP says the invoice should total now */
  totalCents: number;
  /** What was last pushed to the HubSpot draft */
  draftTotalCents: number;
  client: string | null;
  method: string | null;
  sendTo: string | null;
  /** What happens on Approve, e.g. "Emails it to ap@udr.com." */
  deliveryPlan: string;
  /** Null when the invoice isn't emailed (a portal or Other) */
  recipients: DraftRecipientsRow | null;
  /** Client company's payment terms. Null means the due date can be set on the draft. */
  paymentTermsDays: number | null;
  /** A QuickBooks sandbox draft: Approve is a test that changes nothing real. */
  testOnly?: boolean;
  /** The building, job or contract page */
  href: string | null;
  /** Why Approve can't run yet, e.g. no client company */
  blocked: string | null;
  /** Janitorial months can change their amount and extras */
  canEdit: boolean;
  /** QuickBooks picked-work drafts: their lines, each tied to a unit or job (Edit lines) */
  editLines?: { itemKey: string; name: string; amountCents: number }[];
  /** The units or jobs on the draft a line can be for, e.g. "777 South Broad Apartments - Unit 318" */
  lineTargets?: { key: string; label: string }[];
};

export type QboTestRow = { id: string; title: string; invoiceNumber: string | null; totalCents: number; url: string | null; when: string };

/** Where new drafts go on this server, and its recent sandbox test invoices. */
export type QboDraftsInfo = {
  environment: "sandbox" | "production";
  on: boolean;
  tests: QboTestRow[];
  /** What the next QuickBooks invoice number would be, for the switch's confirm box */
  nextInvoiceNumber: number;
};

export type DeliveryRow = {
  id: string;
  status: "NEEDS_UPLOAD" | "NEEDS_SENDING";
  title: string;
  invoiceNumber: string | null;
  totalCents: number;
  reason: string | null;
  clientName: string | null;
  clientCompanyId: string | null;
  method: string | null;
  portalUrl: string | null;
  viewUrl: string | null;
  pdfUrl: string | null;
  /** QuickBooks invoices: where to open it in QuickBooks */
  qboUrl: string | null;
  link: string | null;
  lines: { name: string; description: string; amountCents: number }[];
  /** Company Info logins linked to the client company */
  logins: string[];
  approvedAt: string;
};

export type BillableItemRow = { key: string; kind: "TURN" | "SOV" | "CO"; title: string; lineDescription: string; cents: number; doneKey: string; href: string };

export type BillableGroupRow = {
  key: string;
  name: string;
  type: "BUILDING" | "PROJECT";
  /** Why it can't be drafted (no HubSpot deal, or no client company for QuickBooks) */
  blocker: string | null;
  client: string | null;
  method: string | null;
  sendTo: string | null;
  items: BillableItemRow[];
};

/** API base for a draft row: janitorial months, picked items and QuickBooks drafts live in different places. */
function draftUrl(d: DraftRow): string {
  if (d.kind === "qbo") return `/api/erp/qbo-drafts/${d.rowId}`;
  return d.kind === "month" ? `/api/erp/invoice-drafts/${d.rowId}` : `/api/erp/item-drafts/${d.rowId}`;
}

/** A draft with a blocker (e.g. no client company) can't be approved; the blocker is its hover text. */
const canApprove = (d: DraftRow) => !d.blocked;

type Tab = "approve" | "bill" | "sending" | "contracts";
const TABS: Tab[] = ["approve", "bill", "sending", "contracts"];

/** ?tab=bill&pick=SOV:123 from Project Billing's Bill it link. */
function urlParams(): { tab: Tab | null; pick: string | null } {
  if (typeof window === "undefined") return { tab: null, pick: null };
  const p = new URLSearchParams(window.location.search);
  const tab = p.get("tab") as Tab | null;
  return { tab: tab && TABS.includes(tab) ? tab : null, pick: p.get("pick") };
}

export type ContractSetting = {
  id: string;
  building: string;
  label: string;
  autoDraft: boolean;
  billingDay: number;
  monthlyRateCents: number;
  hasDeal: boolean;
  nextDraftKey: string;
};

function fmtDay(key: string | null): string {
  if (!key) return "Not set";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

export function ReadyToSend({
  drafts,
  deliveries,
  billable,
  failed,
  discarded,
  contracts,
  isAdmin,
  qbo,
}: {
  drafts: DraftRow[];
  deliveries: DeliveryRow[];
  billable: BillableGroupRow[];
  failed: MonthRow[];
  discarded: MonthRow[];
  contracts: ContractSetting[];
  isAdmin: boolean;
  qbo: QboDraftsInfo;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DraftRow | null>(null);
  const [editingLines, setEditingLines] = useState<DraftRow | null>(null);
  const [editingRecipients, setEditingRecipients] = useState<DraftRow | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(deliveries.length ? "sending" : drafts.length || failed.length ? "approve" : "bill");
  const [pick, setPick] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    const { tab: t, pick: p } = urlParams();
    if (t) setTab(t);
    if (p) setPick(p);
  }, []);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function draftNow() {
    await run("draft-now", async () => {
      const { ok, data } = await call("/api/erp/invoice-drafts/run", "POST", {});
      if (!ok) return toast(String(data.error ?? "Could not run."));
      const outcomes = (data.outcomes ?? []) as { result: string; building: string; month: string; note?: string }[];
      const made = outcomes.filter((o) => o.result === "drafted").length;
      const errors = outcomes.filter((o) => o.result === "error");
      toast(
        errors.length
          ? `${made} drafted. ${errors.length} failed: ${errors.map((e) => `${e.building} ${e.month}`).join(", ")}.`
          : made
            ? `${made} draft${made === 1 ? "" : "s"} made.`
            : "Nothing due yet.",
      );
    });
  }

  async function approve(rows: DraftRow[]) {
    const total = rows.reduce((s, r) => s + r.totalCents, 0);
    const qboCount = rows.filter((r) => r.kind === "qbo").length;
    const hubspotCount = rows.length - qboCount;
    const them = (n: number) => (rows.length === 1 ? "the invoice" : `${n} invoice${n === 1 ? "" : "s"}`);
    const where = [
      qboCount ? `Creates ${them(qboCount)} in QuickBooks${qbo.environment === "sandbox" ? " (sandbox test company)" : ""}.` : "",
      hubspotCount ? `Opens ${them(hubspotCount)} in HubSpot, which sends open invoices to QuickBooks.` : "",
      `Total ${centsToDollars(total)}.${rows.every((r) => r.testOnly) ? "" : " This can't be undone from the ERP."}`,
    ]
      .filter(Boolean)
      .join(" ");
    const ok = await confirm({
      title: rows.length === 1 ? `Approve ${rows[0]!.building}, ${rows[0]!.month}?` : `Approve ${rows.length} invoices?`,
      message: `${where} ${rows
        .map((r) => (rows.length === 1 ? r.deliveryPlan : `${r.building}: ${r.deliveryPlan}`))
        .join(" ")}`,
      confirmLabel: "Approve",
      danger: false,
    });
    if (!ok) return;
    await run("approve", async () => {
      const done: string[] = [];
      for (const r of rows) {
        const { ok: good, data } = await call(`${draftUrl(r)}/approve`, "POST");
        if (!good) {
          toast(`${r.building} ${r.month}: ${String(data.error ?? "Could not approve.")}`);
          break;
        }
        done.push(`${String(data.number ?? r.building)}: ${String(data.delivery ?? "")}`);
      }
      if (done.length)
        toast(
          <>
            Approved {done.join(" ")}{" "}
            {!rows.every((r) => r.testOnly) && (
              <a href="/erp/invoices?filter=unpaid" className="font-medium underline">
                See it on Invoices
              </a>
            )}
          </>,
        );
      setSelected(new Set());
    });
  }

  async function discard(r: DraftRow) {
    const ok = await confirm({
      title: `Discard ${r.building}, ${r.month}?`,
      message:
        r.kind === "qbo"
          ? "Nothing was made in QuickBooks yet. Picked items go back on Ready to bill. A janitorial month goes on Discarded, where Draft again brings it back."
          : r.kind === "month"
            ? "Deletes the draft in HubSpot. This month won't be drafted again unless you click Draft again below."
            : "Deletes the draft in HubSpot. Its items go back on Ready to bill.",
      confirmLabel: "Discard",
      danger: true,
    });
    if (!ok) return;
    await run(`discard-${r.rowId}`, async () => {
      const { ok: good, data } = await call(draftUrl(r), "DELETE");
      toast(good ? "Discarded." : String(data.error ?? "Could not discard."));
    });
  }

  async function preview(r: DraftRow) {
    await run(`preview-${r.rowId}`, async () => {
      const { ok, data } = await call("/api/erp/invoice-drafts/preview", "POST", { kind: r.kind, rowId: r.rowId });
      toast(ok ? `Preview sent to ${String(data.to ?? "you")}. Nothing was approved.` : String(data.error ?? "Could not send the preview."));
    });
  }

  async function redraft(m: MonthRow) {
    await run(`redraft-${m.periodId}`, async () => {
      const { ok, data } = await call(`/api/erp/invoice-drafts/${m.periodId}/redraft`, "POST");
      toast(ok ? "Drafted." : String(data.error ?? "Could not draft."));
    });
  }

  async function setQboDrafts(on: boolean, nextInvoiceNumber?: number): Promise<boolean> {
    let saved = false;
    await run("qbo-switch", async () => {
      const { ok, data } = await call("/api/erp/invoice-drafts/settings", "PUT", { qboDrafts: on, nextInvoiceNumber });
      if (!ok) toast(String(data.error ?? "Could not save."));
      else toast(on ? "New invoices now go to QuickBooks." : "New invoices now go to HubSpot. Turn HubSpot's invoice sync to QuickBooks back on.");
      saved = ok;
    });
    return saved;
  }

  async function switchToHubSpot() {
    const ok = await confirm({
      title: "Switch to HubSpot (backup)?",
      message:
        "New drafts will be made in HubSpot instead of QuickBooks. HubSpot only copies invoices into QuickBooks while its invoice sync is on, so turn that back on in HubSpot too, or these invoices won't reach QuickBooks. Drafts already waiting stay where they are.",
      confirmLabel: "Switch to HubSpot",
      danger: true,
    });
    if (ok) await setQboDrafts(false);
  }

  const selectedRows = drafts.filter((d) => selected.has(d.rowId));
  const destination = qbo.on ? `QuickBooks${qbo.environment === "sandbox" ? " (test company)" : ""}` : "HubSpot (backup)";
  const billableCount = billable.reduce((s, g) => s + g.items.length, 0);
  const tabs: { key: Tab; label: string; count?: number; alert?: boolean }[] = [
    { key: "approve", label: "To approve", count: drafts.length, alert: failed.length > 0 },
    { key: "bill", label: "Ready to bill", count: billableCount },
    { key: "sending", label: "Needs sending", count: deliveries.length, alert: deliveries.length > 0 },
    { key: "contracts", label: "Contracts" },
  ];
  const settings = isAdmin
    ? [qbo.on ? { label: "Switch to HubSpot (backup)", onClick: () => void switchToHubSpot() } : { label: "Switch to QuickBooks", onClick: () => setSwitching(true) }]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              tab === t.key ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className="tabular-nums opacity-70">{t.count}</span>}
            {t.alert && <span aria-label="Needs attention" className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
          <span className={`h-2 w-2 rounded-full ${qbo.on ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
          Invoices go to {destination}
          <InfoTip
            align="right"
            text={
              qbo.environment === "sandbox"
                ? "Local dev. QuickBooks drafts here are tests: Approve makes the invoice in Intuit's test company, emails only you a copy, and changes nothing real."
                : qbo.on
                  ? "Approve creates the invoice in QuickBooks, marks the work Billed and sends it to the client. An Admin can switch to HubSpot as a backup from the menu here."
                  : "Backup mode: Approve opens the invoice in HubSpot, and HubSpot copies it into QuickBooks only while its invoice sync is on. An Admin switches back to QuickBooks from the menu here."
            }
          />
          {settings.length > 0 && <RowMenu label="Invoice settings" items={settings} disabled={busy !== null} />}
        </span>
      </div>

      {tab === "approve" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {selectedRows.length > 0 && (
              <Button size="sm" disabled={!selectedRows.every((r) => canApprove(r)) || busy !== null} onClick={() => void approve(selectedRows)}>
                Approve selected ({selectedRows.length})
              </Button>
            )}
            <span className="ml-auto flex items-center gap-1">
              <Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => void draftNow()}>
                {busy === "draft-now" ? "Checking…" : "Draft due months now"}
              </Button>
              <InfoTip align="right" text="Runs the same check as the daily run: drafts any month that's due for contracts with Auto-draft on." />
            </span>
          </div>

          {failed.length > 0 && (
            <details className="rounded-lg border border-amber-200 bg-amber-50 text-sm">
              <summary className="cursor-pointer px-4 py-2 text-amber-900">
                {failed.length} month{failed.length === 1 ? "" : "s"} couldn&apos;t be drafted
              </summary>
              <ul className="divide-y divide-amber-100 border-t border-amber-200 bg-white">
                {failed.map((m) => (
                  <li key={m.periodId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <div className="min-w-0">
                      <div className="text-gray-900">
                        {m.building}, {m.month}
                      </div>
                      <div className="text-xs text-red-700">{m.note}</div>
                    </div>
                    <Button size="xs" variant="secondary" disabled={busy !== null} onClick={() => void redraft(m)}>
                      Try again
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {drafts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">Nothing to approve.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
              {drafts.map((d) => {
                const stale = d.totalCents !== d.draftTotalCents;
                const warning = [d.blocked ?? d.note, stale ? `The draft in HubSpot says ${centsToDollars(d.draftTotalCents)}. Approve updates it to ${centsToDollars(d.totalCents)} first.` : null]
                  .filter(Boolean)
                  .join(" ");
                const isOpen = expanded === d.rowId;
                return (
                  <li key={d.rowId}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${d.building}`}
                        checked={selected.has(d.rowId)}
                        onChange={(e) =>
                          setSelected((s) => {
                            const next = new Set(s);
                            if (e.target.checked) next.add(d.rowId);
                            else next.delete(d.rowId);
                            return next;
                          })
                        }
                      />
                      <button type="button" onClick={() => setExpanded(isOpen ? null : d.rowId)} className="min-w-0 flex-1 text-left">
                        <span className="flex items-center gap-1.5 font-medium text-gray-900">
                          <span className="truncate">{d.building}</span>
                          <span className="shrink-0 font-normal text-gray-500">· {d.month}</span>
                          {warning && <span title={warning} aria-label={warning} className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {d.client ?? "No client company"} · Due {fmtDay(d.dueDate)}
                        </span>
                      </button>
                      <span className="text-right font-semibold tabular-nums text-gray-900">{centsToDollars(d.totalCents)}</span>
                      <Button size="xs" disabled={!canApprove(d) || busy !== null} onClick={() => void approve([d])} title={d.blocked ?? undefined}>
                        {d.testOnly ? "Test approve" : "Approve"}
                      </Button>
                      <RowMenu
                        label={`More for ${d.building}`}
                        disabled={busy !== null}
                        items={[
                          ...(d.href ? [{ label: "Open page", href: d.href }] : []),
                          { label: "Email me a preview", onClick: () => void preview(d) },
                          ...(d.canEdit ? [{ label: "Edit amounts", onClick: () => setEditing(d) }] : []),
                          ...(d.editLines ? [{ label: "Edit lines", onClick: () => setEditingLines(d) }] : []),
                          ...(d.recipients ? [{ label: "Edit recipients", onClick: () => setEditingRecipients(d) }] : []),
                          { label: "Discard", onClick: () => void discard(d), danger: true },
                        ]}
                      />
                    </div>
                    {isOpen && (
                      <div className="space-y-2 border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                        <table className="w-full">
                          <tbody className="divide-y divide-gray-100">
                            {d.lines.map((l, i) => (
                              <tr key={i}>
                                <td className="py-1 pr-2 text-gray-900">
                                  {l.name}
                                  <span className="ml-2 text-xs text-gray-500">{l.description}</span>
                                </td>
                                <td className="py-1 text-right tabular-nums text-gray-900">{centsToDollars(l.amountCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                          <span>Invoice date {fmtDay(d.invoiceDateKey)}</span>
                          {d.paymentTermsDays != null ? <span>Due {fmtDay(d.dueDate)} (Net {d.paymentTermsDays})</span> : <DueDateInput draft={d} />}
                          {d.method && <span>{d.method}</span>}
                          {!d.recipients && d.sendTo && <span>{d.sendTo}</span>}
                        </div>
                        {d.recipients && (
                          <div className="flex items-start gap-2 text-xs text-gray-600">
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="break-words">
                                <span className="text-gray-500">To </span>
                                {d.recipients.to.join(", ") || <span className="text-amber-700">nobody yet</span>}
                              </p>
                              {d.recipients.cc.length > 0 && (
                                <p className="break-words">
                                  <span className="text-gray-500">Cc </span>
                                  {d.recipients.cc.join(", ")}
                                </p>
                              )}
                              {d.recipients.from && <p className="text-gray-400">{d.recipients.from}</p>}
                            </div>
                            <button type="button" onClick={() => setEditingRecipients(d)} className="shrink-0 font-medium text-pink-600 hover:text-pink-700">
                              Edit
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-gray-600">On Approve: {d.deliveryPlan}</p>
                        {warning && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">{warning}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {qbo.tests.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">QuickBooks sandbox tests ({qbo.tests.length})</summary>
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                {qbo.tests.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate text-gray-900">
                      {t.invoiceNumber ? `${t.invoiceNumber} · ` : ""}
                      {t.title}
                    </span>
                    <span className="text-xs tabular-nums text-gray-500">
                      {centsToDollars(t.totalCents)} · {new Date(t.when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    {t.url && (
                      <a href={t.url} target="_blank" rel="noreferrer" className="text-xs text-pink-600 hover:text-pink-700">
                        Open
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {discarded.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700">Discarded months ({discarded.length})</summary>
              <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                {discarded.map((m) => (
                  <li key={m.periodId} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span className="text-gray-700">
                      {m.building}, {m.month}
                      {m.discardedBy && <span className="ml-2 text-xs text-gray-500">by {m.discardedBy}</span>}
                    </span>
                    <Button size="xs" variant="secondary" disabled={busy !== null} onClick={() => void redraft(m)}>
                      Draft again
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {tab === "bill" && <ReadyToBill groups={billable} pick={pick} />}

      {tab === "sending" && <NeedsSending rows={deliveries} />}

      {tab === "contracts" && <ContractSettings contracts={contracts} toQuickBooks={qbo.on} />}

      {editing && <EditDraft draft={editing} onClose={() => setEditing(null)} />}
      {editingLines && <EditLines draft={editingLines} onClose={() => setEditingLines(null)} />}
      {editingRecipients && <EditRecipients draft={editingRecipients} onClose={() => setEditingRecipients(null)} />}
      {switching && (
        <SwitchToQuickBooks
          suggested={qbo.nextInvoiceNumber}
          busy={busy !== null}
          onClose={() => setSwitching(false)}
          onConfirm={async (n) => {
            if (await setQboDrafts(true, n)) setSwitching(false);
          }}
        />
      )}
    </div>
  );
}

/** Confirm box for switching new invoices to QuickBooks, with the next invoice number. */
function SwitchToQuickBooks({ suggested, busy, onClose, onConfirm }: { suggested: number; busy: boolean; onClose: () => void; onConfirm: (n: number) => Promise<void> }) {
  const [value, setValue] = useState(String(suggested));
  const n = Number(value);
  const valid = Number.isInteger(n) && n > 0;
  return (
    <Modal open onClose={onClose} dismissible={!busy} size="sm">
      <h3 className="text-base font-semibold text-gray-900">Switch to QuickBooks</h3>
      <p className="mt-1 text-xs text-gray-500">New drafts will be made for QuickBooks. Approve creates each invoice there and sends it to the client. Drafts already waiting stay as they are.</p>
      <label className={`${labelClass.default} mt-4`}>
        <span className="flex items-center gap-1">
          Next invoice number
          <InfoTip text="Filled in from the highest invoice number the ERP knows. If someone made an invoice in HubSpot today, check its number there and use the one after it." />
        </span>
        <span className="mt-1 flex items-center gap-1 text-sm text-gray-700">
          INV-
          <input value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${inputClass.md} w-32`} />
        </span>
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" disabled={!valid || busy} onClick={() => void onConfirm(n)}>
          Switch to QuickBooks
        </Button>
      </div>
    </Modal>
  );
}

type MenuItem = { label: string; onClick?: () => void; href?: string; external?: boolean; danger?: boolean };

/** A small "..." menu for a row's less common actions and links. */
function RowMenu({ label, items, disabled }: { label: string; items: MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!items.length) return <span className="w-7" />;
  const itemCls = (danger?: boolean) => `block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${danger ? "text-red-600" : "text-gray-700"}`;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
      >
        <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {items.map((i) =>
            i.href ? (
              <a key={i.label} href={i.href} target={i.external ? "_blank" : undefined} rel={i.external ? "noreferrer" : undefined} className={itemCls(i.danger)} onClick={() => setOpen(false)}>
                {i.label}
              </a>
            ) : (
              <button
                key={i.label}
                type="button"
                className={itemCls(i.danger)}
                onClick={() => {
                  setOpen(false);
                  i.onClick?.();
                }}
              >
                {i.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ContractSettings({ contracts, toQuickBooks }: { contracts: ContractSetting[]; toQuickBooks: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [labels, setLabels] = useState<Record<string, string>>(() => Object.fromEntries(contracts.map((c) => [c.id, c.label])));

  async function patch(id: string, body: Record<string, unknown>) {
    const { ok, data } = await call(`/api/erp/invoice-drafts/contracts/${id}`, "PATCH", body);
    if (!ok) toast(String(data.error ?? "Could not save."));
    router.refresh();
  }

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Janitorial contracts
        <InfoTip
          text={`Turn Auto-draft on one contract at a time. Turn it on only once nobody makes that contract's invoice by hand in ${toQuickBooks ? "QuickBooks or HubSpot" : "HubSpot"}, or the month gets two invoices.`}
        />
      </h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Auto-draft</th>
              <th className="px-3 py-2 font-medium">Building</th>
              <th className="px-3 py-2 font-medium">
                <span className="inline-flex items-center gap-1">
                  Invoice label
                  <InfoTip text='Shown as "Recurring cleaning <label>" on the invoice. Blank uses the building name.' />
                </span>
              </th>
              <th className="px-3 py-2 text-right font-medium">Monthly</th>
              <th className="px-3 py-2 font-medium">Billing day</th>
              <th className="px-3 py-2 font-medium">Next draft</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contracts.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Auto-draft ${c.building}`}
                    checked={c.autoDraft}
                    disabled={!c.hasDeal && !c.autoDraft}
                    onChange={(e) => void patch(c.id, { autoDraftInvoices: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2 text-gray-900">
                  {c.building}
                  {!c.hasDeal && <span className="ml-2 text-xs text-red-700">No HubSpot deal linked</span>}
                </td>
                <td className="px-3 py-2">
                  <input
                    value={labels[c.id] ?? ""}
                    placeholder={c.building}
                    onChange={(e) => setLabels((l) => ({ ...l, [c.id]: e.target.value }))}
                    onBlur={() => (labels[c.id] ?? "") !== c.label && void patch(c.id, { invoiceLabel: labels[c.id] ?? "" })}
                    className={`${inputClass.sm} w-48`}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-900">{centsToDollars(c.monthlyRateCents)}</td>
                <td className="px-3 py-2 text-gray-700">{c.billingDay}</td>
                <td className="px-3 py-2 text-gray-700">{c.autoDraft ? fmtDay(c.nextDraftKey) : <span className="text-gray-400">Off</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditDraft({ draft, onClose }: { draft: DraftRow; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState((draft.amountCents / 100).toFixed(2));
  const [extras, setExtras] = useState(draft.charges.map((c) => ({ description: c.description, amount: (c.amountCents / 100).toFixed(2) })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const amountCents = parseMoneyInput(amount);
    if (amountCents == null) return setError("Enter the monthly amount.");
    const charges = [];
    for (const x of extras) {
      if (!x.description.trim() && !x.amount.trim()) continue;
      const cents = parseMoneyInput(x.amount);
      if (!x.description.trim() || cents == null) return setError("Each extra needs a description and an amount.");
      charges.push({ description: x.description.trim(), amountCents: cents });
    }
    setSaving(true);
    setError("");
    const { ok, data } = await call(draftUrl(draft), "PUT", { amountCents, charges });
    setSaving(false);
    if (!ok) return setError(String(data.error ?? "Could not save."));
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="md">
      <h3 className="text-base font-semibold text-gray-900">
        {draft.building}, {draft.month}
      </h3>
      <p className="mt-1 text-xs text-gray-500">
        Saves on the month in the ERP (Billing shows the same){draft.kind === "month" ? " and updates the HubSpot draft" : ""}.
      </p>
      <div className="mt-4 space-y-3">
        <label className={labelClass.default}>
          Monthly amount
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`${inputClass.md} sm:w-40`} />
        </label>
        <div>
          <span className={`${labelClass.default} flex items-center gap-1`}>
            Extras this month
            <InfoTip text="Each extra is its own line on the invoice, e.g. Pool chairs cleaning." />
          </span>
          <div className="mt-1 space-y-2">
            {extras.map((x, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={x.description}
                  onChange={(e) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))}
                  placeholder="Description"
                  className={`${inputClass.sm} flex-1`}
                />
                <input
                  value={x.amount}
                  onChange={(e) => setExtras((xs) => xs.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))}
                  placeholder="0.00"
                  inputMode="decimal"
                  className={`${inputClass.sm} w-28`}
                />
                <Button size="xs" variant="ghost" onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            <Button size="xs" variant="secondary" onClick={() => setExtras((xs) => [...xs, { description: "", amount: "" }])}>
              + Add extra
            </Button>
          </div>
        </div>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

/** A QuickBooks picked-work draft's lines: rename, reprice, remove or add. Changes the invoice only, never the job's price. */
function EditLines({ draft, onClose }: { draft: DraftRow; onClose: () => void }) {
  const router = useRouter();
  // "777 South Broad Apartments - Unit 318" reads "Unit 318": the building is the title.
  const prefix = `${draft.building} - `;
  const targets = (draft.lineTargets ?? []).map((t) => ({ ...t, label: t.label.startsWith(prefix) ? t.label.slice(prefix.length) : t.label }));
  const [rows, setRows] = useState((draft.editLines ?? []).map((l) => ({ itemKey: l.itemKey, name: l.name, amount: (l.amountCents / 100).toFixed(2) })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const newTotal = rows.reduce((sum, r) => sum + (parseMoneyInput(r.amount) ?? 0), 0);
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    const lines = [];
    for (const r of rows) {
      const cents = parseMoneyInput(r.amount);
      if (!r.itemKey) return setError("Pick what each line is for.");
      if (!r.name.trim() || cents == null) return setError("Each line needs a name and an amount.");
      lines.push({ itemKey: r.itemKey, name: r.name.trim(), amountCents: cents });
    }
    setSaving(true);
    setError("");
    const { ok, data } = await call(draftUrl(draft), "PUT", { lines });
    setSaving(false);
    if (!ok) return setError(String(data.error ?? "Could not save."));
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="lg">
      <h3 className="flex items-center gap-1 text-base font-semibold text-gray-900">
        {draft.building}
        <InfoTip text="Changes this invoice only. The job keeps its own price; each unit or job is billed the total of its lines." />
      </h3>
      <div className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="space-y-2 rounded-md border border-gray-200 p-3">
            <input value={r.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Line, e.g. Trash removal" aria-label="Line name" className={inputClass.sm} />
            <div className="flex gap-2">
              <SearchableSelect
                value={r.itemKey}
                onChange={(v) => update(i, { itemKey: v })}
                options={targets.map((t) => ({ value: t.key, label: t.label }))}
                allLabel="Pick a unit or job"
                placeholder="For…"
                className="min-w-0 flex-1"
              />
              <input
                value={r.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
                placeholder="0.00"
                inputMode="decimal"
                aria-label="Amount"
                // inputClass is full width; the amount keeps a fixed width beside the unit picker.
                className={`${inputClass.sm.replace("w-full", "w-28")} shrink-0 py-1.5`}
              />
              <Button size="xs" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button size="xs" variant="secondary" onClick={() => setRows((rs) => [...rs, { itemKey: targets.length === 1 ? targets[0]!.key : "", name: "", amount: "" }])}>
          + Add line
        </Button>
        <p className="flex justify-between border-t border-gray-100 pt-2 text-sm">
          <span className="text-gray-500">Total</span>
          <span className="font-semibold tabular-nums text-gray-900">
            {centsToDollars(newTotal)}
            {newTotal !== draft.totalCents && <span className="ml-2 font-normal text-gray-500">was {centsToDollars(draft.totalCents)}</span>}
          </span>
        </p>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

type Send = "to" | "cc" | "off";

/** Who the invoice is emailed to: the company's and job's contacts, plus any other address. */
function EditRecipients({ draft, onClose }: { draft: DraftRow; onClose: () => void }) {
  const router = useRouter();
  const r = draft.recipients!;
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const sendOf = (email: string): Send => (r.to.some((t) => same(t, email)) ? "to" : r.cc.some((c) => same(c, email)) ? "cc" : "off");
  // Saved contacts first, then any current address that isn't one of them.
  const [rows, setRows] = useState(() => [
    ...r.contacts.map((c) => ({ email: c.email, label: c.name, detail: [c.role, c.from === "Job" ? "Job contact" : null].filter(Boolean).join(" · "), send: sendOf(c.email) })),
    ...[...r.to, ...r.cc]
      .filter((e, i, all) => !r.contacts.some((c) => same(c.email, e)) && all.findIndex((x) => same(x, e)) === i)
      .map((e) => ({ email: e, label: e, detail: "Other", send: sendOf(e) })),
  ]);
  const [other, setOther] = useState("");
  const [forFuture, setForFuture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const setSend = (i: number, send: Send) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, send } : x)));

  function addOther() {
    const e = other.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setError(`"${e}" isn't an email address.`);
    setError("");
    setOther("");
    const at = rows.findIndex((x) => same(x.email, e));
    if (at >= 0) return setSend(at, "to");
    setRows((rs) => [...rs, { email: e, label: e, detail: "Other", send: "to" }]);
  }

  async function send(body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    const { ok, data } = await call("/api/erp/draft-recipients", "PUT", { kind: draft.kind, rowId: draft.rowId, ...body });
    setSaving(false);
    if (!ok) return setError(String(data.error ?? "Could not save."));
    onClose();
    router.refresh();
  }

  const to = rows.filter((x) => x.send === "to").map((x) => x.email);
  const cc = rows.filter((x) => x.send === "cc").map((x) => x.email);

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="lg">
      <h3 className="flex items-center gap-1 text-base font-semibold text-gray-900">
        Who gets {draft.building}
        <InfoTip text={`Now: ${r.from ?? "nothing set"}. Saving changes this invoice; tick the box below to keep it for later invoices too.`} />
      </h3>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {rows.map((x, i) => (
              <li key={x.email} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-900">{x.label}</p>
                  <p className="truncate text-xs text-gray-500">{[x.label !== x.email ? x.email : null, x.detail].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex shrink-0 overflow-hidden rounded-md border border-gray-300 text-xs">
                  {(["to", "cc", "off"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSend(i, v)}
                      className={`px-2.5 py-1 ${x.send === v ? "bg-pink-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                      {v === "to" ? "To" : v === "cc" ? "Cc" : "Off"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No saved contacts with an email. Add an address below.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {r.contacts.length > 1 && (
            <Button size="xs" variant="secondary" onClick={() => setRows((rs) => rs.map((x) => (x.detail === "Other" ? x : { ...x, send: "to" })))}>
              All contacts to To
            </Button>
          )}
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && other.trim()) {
                e.preventDefault();
                addOther();
              }
            }}
            placeholder="Other email"
            inputMode="email"
            aria-label="Other email"
            className={`${inputClass.sm.replace("w-full", "w-56")} py-1.5`}
          />
          <Button size="xs" variant="secondary" onClick={addOther} disabled={!other.trim()}>
            Add
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={forFuture} onChange={(e) => setForFuture(e.target.checked)} />
          Also use for future invoices to this {r.groupLabel}
        </label>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        {r.set && (
          <Button variant="ghost" size="sm" className="mr-auto" onClick={() => void send({ reset: true })} disabled={saving}>
            Use billing settings
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => (to.length ? void send({ to, cc, forFuture }) : setError("Pick at least one person for To."))} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

/** Finished, unbilled work with no invoice yet. Tick items and draft: one invoice per building or job. */
function ReadyToBill({ groups, pick }: { groups: BillableGroupRow[]; /** Item key to tick on arrival, from Project Billing */ pick: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickMissing, setPickMissing] = useState(false);

  // Arriving from Bill it: tick that item and bring its group into view.
  useEffect(() => {
    if (!pick) return;
    const group = groups.find((g) => g.items.some((i) => i.key === pick));
    if (!group || group.blocker) {
      setPickMissing(true);
      return;
    }
    setPicked(new Set([pick]));
    document.getElementById(`bill-${group.key}`)?.scrollIntoView({ block: "center" });
    // Only on arrival; later refreshes keep whatever was ticked by hand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const allItems = groups.flatMap((g) => g.items);
  const amountOf = (i: BillableItemRow) => amounts[i.key] ?? (i.cents / 100).toFixed(2);
  const pickedItems = allItems.filter((i) => picked.has(i.key));
  const pickedGroups = groups.filter((g) => g.items.some((i) => picked.has(i.key))).length;

  function toggle(keys: string[], on: boolean) {
    setPicked((p) => {
      const next = new Set(p);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  async function draft() {
    const picks = [];
    for (const i of pickedItems) {
      const cents = parseMoneyInput(amountOf(i));
      if (cents == null || cents < 0) return toast(`Check the amount for ${i.title}.`);
      picks.push({ key: i.key, amountCents: cents });
    }
    setBusy(true);
    const { ok, data } = await call("/api/erp/item-drafts", "POST", { picks });
    setBusy(false);
    if (!ok) return toast(String(data.error ?? "Could not draft."));
    const results = (data.results ?? []) as { group: string; ok: boolean; note?: string }[];
    const made = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    toast(failed.length ? `${made} drafted. Not drafted: ${failed.map((f) => `${f.group} (${f.note})`).join("; ")}` : `${made} draft${made === 1 ? "" : "s"} made.`);
    setPicked(new Set());
    setAmounts({});
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1 text-xs text-gray-500">
          Finished work with no invoice yet. Tick what to bill.
          <InfoTip text="Unit turns, post-construction SOV lines and change orders that aren't billed. Click Draft invoice for one draft per building or job: one line per service for a unit turn, one line per item otherwise. Amounts can be changed first." />
        </p>
        {pickMissing && (
          <span className="text-xs text-amber-800" title="It shows here once it's marked complete, has a price, isn't billed, and its building or job has a client company.">
            That item isn&apos;t ready to bill yet.
          </span>
        )}
        {pickedItems.length > 0 && (
          <Button size="sm" className="ml-auto" disabled={busy} onClick={() => void draft()}>
            {busy ? "Drafting…" : `Draft invoice${pickedGroups === 1 ? "" : "s"} (${pickedItems.length} item${pickedItems.length === 1 ? "" : "s"}, ${pickedGroups} invoice${pickedGroups === 1 ? "" : "s"})`}
          </Button>
        )}
      </div>
      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">Nothing finished is waiting to be billed.</p>
      ) : (
        groups.map((g) => {
          const keys = g.items.map((i) => i.key);
          const all = keys.every((k) => picked.has(k));
          return (
            <div key={g.key} id={`bill-${g.key}`} className="scroll-mt-24 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
                <label className="flex items-center gap-2 font-medium text-gray-900">
                  <input type="checkbox" checked={all} disabled={!!g.blocker} onChange={(e) => toggle(keys, e.target.checked)} />
                  {g.name}
                  <span className="text-xs font-normal text-gray-500">{g.type === "BUILDING" ? "Building" : "Job"}</span>
                </label>
                <span className="text-xs text-gray-500" title={g.blocker ? undefined : [g.method, g.sendTo].filter(Boolean).join(" · ") || undefined}>
                  {g.blocker ? <span className="text-red-700">{g.blocker}</span> : (g.client ?? "No client company")}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {g.items.map((i) => (
                    <tr key={i.key}>
                      <td className="w-8 px-4 py-1.5">
                        <input type="checkbox" aria-label={`Bill ${i.title}`} checked={picked.has(i.key)} disabled={!!g.blocker} onChange={(e) => toggle([i.key], e.target.checked)} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <a href={i.href} className="text-gray-900 hover:text-pink-600">
                          {i.kind === "TURN" ? i.lineDescription : i.title}
                        </a>
                        <span className="ml-2 text-xs text-gray-500">
                          {i.kind === "TURN" ? "Unit turn" : i.kind === "SOV" ? "SOV line" : "Change order"} · done {fmtDay(i.doneKey)}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <input
                          aria-label={`Amount for ${i.title}`}
                          value={amountOf(i)}
                          onChange={(e) => setAmounts((a) => ({ ...a, [i.key]: e.target.value }))}
                          inputMode="decimal"
                          className={`${inputClass.sm} w-28 text-right tabular-nums`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </section>
  );
}


/** Approved invoices that still have to reach the client: portal uploads, and emails that couldn't go out. */
function NeedsSending({ rows }: { rows: DeliveryRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function act(r: DeliveryRow, what: "done" | "email-again") {
    setBusy(r.id);
    const { ok, data } = await call(`/api/erp/invoice-deliveries/${r.id}/${what}`, "POST");
    setBusy(null);
    toast(ok ? (what === "done" ? "Marked done." : String(data.note ?? "Emailed.")) : String(data.error ?? "Could not save."));
    router.refresh();
  }

  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">Everything approved has reached the client.</p>;
  }

  return (
    <section className="space-y-2">
      <p className="flex items-center gap-1 text-xs text-gray-500">
        Approved, but not with the client yet. Click one for its lines and links.
        <InfoTip text="Portal clients: open the portal, upload the PDF with these amounts (click an amount to copy it), then Mark uploaded. Email problems: fix the address on the company, building or project, then Email again from the menu." />
      </p>
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
        {rows.map((r) => {
          const isOpen = expanded === r.id;
          const links: MenuItem[] = [
            ...(r.portalUrl ? [{ label: `Open ${r.method ?? "portal"}`, href: r.portalUrl, external: true }] : []),
            ...(r.pdfUrl ? [{ label: "Invoice PDF", href: r.pdfUrl, external: true }] : []),
            ...(r.qboUrl ? [{ label: "Open in QuickBooks", href: r.qboUrl, external: true }] : []),
            ...(r.viewUrl ? [{ label: r.qboUrl ? "Client pay link" : "HubSpot invoice", href: r.viewUrl, external: true }] : []),
            ...(r.clientCompanyId ? [{ label: "Company page", href: `/erp/companies/${r.clientCompanyId}` }] : []),
          ];
          return (
            <li key={r.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setExpanded(isOpen ? null : r.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium text-gray-900">
                    {r.invoiceNumber ? `${r.invoiceNumber} · ` : ""}
                    {r.title}
                  </span>
                  <span className="block truncate text-xs text-amber-800">{r.reason}</span>
                </button>
                <span className="font-semibold tabular-nums text-gray-900">{centsToDollars(r.totalCents)}</span>
                <Button size="xs" disabled={busy !== null} onClick={() => void act(r, "done")}>
                  {r.status === "NEEDS_UPLOAD" ? "Mark uploaded" : "Mark sent"}
                </Button>
                <RowMenu
                  label={`More for ${r.title}`}
                  disabled={busy !== null}
                  items={[...(r.status === "NEEDS_SENDING" ? [{ label: "Email again", onClick: () => void act(r, "email-again") }] : []), ...links]}
                />
              </div>
              {isOpen && (
                <div className="space-y-2 border-t border-gray-100 bg-gray-50 px-4 py-3 text-sm">
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-100">
                      {r.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="py-1 pr-2 text-gray-900">
                            {l.name}
                            {l.description && <span className="ml-2 text-xs text-gray-500">{l.description}</span>}
                          </td>
                          <td className="py-1 text-right tabular-nums text-gray-900">
                            <button type="button" title="Copy amount" className="hover:text-pink-600" onClick={() => void navigator.clipboard.writeText((l.amountCents / 100).toFixed(2)).then(() => toast("Amount copied."))}>
                              {centsToDollars(l.amountCents)}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span className="text-gray-600">{[r.clientName ?? "No client company", r.method].filter(Boolean).join(" · ")}</span>
                    {r.logins.length > 0 && <span className="text-gray-600">Login: {r.logins.join(", ")}</span>}
                    {links.map((l) => (
                      <a key={l.label} href={l.href} target={l.external ? "_blank" : undefined} rel={l.external ? "noreferrer" : undefined} className="font-medium text-pink-600 hover:underline">
                        {l.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}


/** Due date picker for a draft whose client company has no payment terms. Saves to HubSpot on change. */
function DueDateInput({ draft }: { draft: DraftRow }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(draft.dueDate ?? draft.invoiceDateKey);
  const [saving, setSaving] = useState(false);

  async function save(next: string) {
    setValue(next);
    if (!next || next === (draft.dueDate ?? draft.invoiceDateKey)) return;
    setSaving(true);
    const { ok, data } = await call("/api/erp/invoice-drafts/due-date", "POST", { kind: draft.kind, rowId: draft.rowId, dueDate: next });
    setSaving(false);
    if (!ok) {
      toast(String(data.error ?? "Could not save the due date."));
      setValue(draft.dueDate ?? draft.invoiceDateKey);
      return;
    }
    toast(`Due date set to ${fmtDay(next)}.`);
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-1">
      Due
      <input
        type="date"
        aria-label="Due date"
        value={value}
        min={draft.invoiceDateKey}
        disabled={saving}
        onChange={(e) => void save(e.target.value)}
        className="rounded border border-gray-300 px-1 py-0.5 text-xs text-gray-900"
      />
      <InfoTip text="This client has no payment terms on its company page, so set the due date here. Leave it on the invoice date for due on receipt. Adding terms (Net 30...) on the company sets it for every invoice." />
    </span>
  );
}
