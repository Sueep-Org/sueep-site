"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StaffSubCoRequest, SubCoTabData } from "@/lib/erp/subCoRequestReview";
import { Button, InfoTip } from "@/app/erp/components/ui";

const STATUS_TONE: Record<string, string> = {
  SUBMITTED: "bg-amber-50 text-amber-800",
  OFFICE_REVIEW: "bg-amber-50 text-amber-800",
  READY: "bg-red-50 text-red-700",
  WAITING_PM: "bg-sky-50 text-sky-800",
  APPROVED: "bg-emerald-50 text-emerald-800",
  DENIED: "bg-red-50 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

function money(cents: number | null) {
  if (cents == null) return "-";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });
}

function toDollars(cents: number | null): string {
  return cents == null ? "" : String(cents / 100);
}

function toCents(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

/** The unit's CO Requests tab: subs' change order requests with both prices, for the office to price, send on, or cancel. */
export function ProjectSubCoRequests({ data, buildingId, projectId }: { data: SubCoTabData; buildingId: string | null; projectId: string }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
        <span className="font-medium text-gray-900">Property manager:</span>
        {data.propertyManagers.length ? (
          <span>{data.propertyManagers.map((m) => `${m.name} (${m.email})`).join(", ")}</span>
        ) : (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
            No email.{" "}
            {buildingId && (
              <Link href={`/erp/buildings/${buildingId}`} className="underline">
                Add one on the building
              </Link>
            )}
          </span>
        )}
        <InfoTip
          wide
          text={"Subs send these from the link in their turnover invite. The property manager sees the charge only; the sub sees their pay only.\n\nRequests with an Other line, or with no property manager email, wait here for the office. The rest are emailed to the property manager right away, with David, Jennifer, Nick and Edwin copied.\n\nChanging one the property manager hasn't answered emails them the update."}
        />
      </div>

      {data.requests.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">No change order requests from subs on this unit.</p>
      ) : (
        // Keyed on the history too, so a saved change resets the card's edit boxes
        data.requests.map((r) => <RequestCard key={`${r.id}-${r.status}-${r.events.length}`} request={r} surchargeOptions={data.surchargeOptions} projectId={projectId} />)
      )}
    </div>
  );
}

type LineDraft = { id: string; quantity: string; charge: string; sub: string; remove: boolean };

function RequestCard({ request: r, surchargeOptions, projectId }: { request: StaffSubCoRequest; surchargeOptions: SubCoTabData["surchargeOptions"]; projectId: string }) {
  const router = useRouter();
  const initialLines = () => r.lines.map((l) => ({ id: l.id, quantity: String(l.quantity), charge: toDollars(l.unitChargeCents), sub: toDollars(l.unitSubPayCents), remove: false }));
  const [lines, setLines] = useState<LineDraft[]>(initialLines);
  const [surchargeId, setSurchargeId] = useState<string>(r.surcharge?.id ?? "");
  const [cancelling, setCancelling] = useState(false);
  const [answering, setAnswering] = useState<"APPROVED" | "DENIED" | null>(null);
  const [answerReason, setAnswerReason] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const original = new Map(r.lines.map((l) => [l.id, l]));
  const changedLines = lines.filter((d) => {
    const o = original.get(d.id)!;
    return d.remove || Number(d.quantity) !== o.quantity || toCents(d.charge) !== o.unitChargeCents || toCents(d.sub) !== o.unitSubPayCents;
  });
  const dirty = changedLines.length > 0 || surchargeId !== (r.surcharge?.id ?? "");

  // Live totals while editing
  const pct = surchargeId ? (surchargeOptions.find((s) => s.id === surchargeId)?.percent ?? r.surcharge?.percent ?? 0) : 0;
  const kept = lines.filter((l) => !l.remove);
  const sum = (key: "charge" | "sub") => kept.reduce((s, l) => s + (toCents(l[key]) ?? 0) * (Number(l.quantity) || 0), 0);
  const chargeTotal = Math.round(sum("charge") * (1 + pct / 100));
  const subTotal = Math.round(sum("sub") * (1 + pct / 100));
  const margin = chargeTotal - subTotal;

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const res = await fetch(`/api/erp/sub-co-requests/${r.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; warning?: string };
      if (!res.ok) {
        setError(data.error || "Save failed");
        router.refresh();
        return false;
      }
      if (data.warning) setWarning(data.warning);
      router.refresh();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    for (const l of changedLines) {
      if (l.remove) continue;
      const q = Number(l.quantity);
      if (!Number.isInteger(q) || q < 1 || q > 99) return setError("Quantity must be 1 to 99.");
      if ((l.charge.trim() && toCents(l.charge) == null) || (l.sub.trim() && toCents(l.sub) == null)) return setError("Prices must be numbers.");
    }
    await act({
      action: "update",
      lines: changedLines.map((l) => (l.remove ? { id: l.id, remove: true } : { id: l.id, quantity: Number(l.quantity), unitChargeCents: toCents(l.charge), unitSubPayCents: toCents(l.sub) })),
      surchargeId: surchargeId || null,
    });
  }

  const input = "w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-right text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-700";
  const canSend = r.editable && !dirty && r.blockers.length === 0;
  const sendLabel = r.status === "WAITING_PM" ? "Email property manager again" : "Send to property manager";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{r.subName}</p>
          <p className="text-xs text-gray-500">Sent {when(r.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {r.blockers.map((b) => (
            <span key={b} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {b}
            </span>
          ))}
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status] ?? "bg-gray-100 text-gray-700"}`}>{r.statusLabel}</span>
        </div>
      </div>

      {r.photoIds.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {r.photoIds.map((id) => (
            <a key={id} href={`/api/erp/sub-co-requests/photos/${id}`} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/erp/sub-co-requests/photos/${id}`} alt="" className="h-24 w-24 rounded-md object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 pr-3">Line</th>
              <th className="py-2 pr-3 text-right">Qty</th>
              <th className="py-2 pr-3 text-right">Sub pay each</th>
              <th className="py-2 pr-3 text-right">Charge each</th>
              {r.editable && <th className="w-8 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {r.lines.map((l) => {
              const d = lines.find((x) => x.id === l.id)!;
              const set = (patch: Partial<LineDraft>) => setLines((cur) => cur.map((x) => (x.id === l.id ? { ...x, ...patch } : x)));
              const unpriced = l.unitChargeCents == null || l.unitSubPayCents == null;
              return (
                <tr key={l.id} className={d.remove ? "opacity-40 line-through" : ""}>
                  <td className="py-2 pr-3 text-gray-900">
                    {l.description ? (
                      <>
                        <span className="font-medium">Other:</span> {l.description}
                      </>
                    ) : (
                      l.label
                    )}
                    {unpriced && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Needs a price</span>}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <input value={d.quantity} onChange={(e) => set({ quantity: e.target.value })} disabled={!r.editable || busy || d.remove} type="number" min="1" max="99" aria-label="Quantity" className={`${input} w-14`} />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <input value={d.sub} onChange={(e) => set({ sub: e.target.value })} disabled={!r.editable || busy || d.remove} type="number" min="0" step="0.01" placeholder="$" aria-label="Sub pay each" className={input} />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <input value={d.charge} onChange={(e) => set({ charge: e.target.value })} disabled={!r.editable || busy || d.remove} type="number" min="0" step="0.01" placeholder="$" aria-label="Charge each" className={input} />
                  </td>
                  {r.editable && (
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => set({ remove: !d.remove })}
                        disabled={busy}
                        aria-label={d.remove ? "Keep line" : "Remove line"}
                        title={d.remove ? "Keep line" : "Remove line"}
                        className="rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        {d.remove ? "↺" : "✕"}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <label className="text-xs font-medium text-gray-600">
          <span className="flex items-center gap-1">
            Surcharge <InfoTip text="Adds the percent on top of both the charge and the sub pay. The sub hears about it when it's approved." />
          </span>
          <select
            value={surchargeId}
            onChange={(e) => setSurchargeId(e.target.value)}
            disabled={!r.editable || busy}
            className="mt-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:bg-gray-50"
          >
            <option value="">None</option>
            {r.surcharge && !surchargeOptions.some((s) => s.id === r.surcharge!.id) && (
              <option value={r.surcharge.id}>
                {r.surcharge.label} (+{r.surcharge.percent}%)
              </option>
            )}
            {surchargeOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} (+{s.percent}%)
              </option>
            ))}
          </select>
        </label>
        <dl className="grid grid-cols-3 gap-4 text-right text-sm">
          <div>
            <dt className="text-xs text-gray-500">Sub pay</dt>
            <dd className="font-semibold text-gray-900">{money(subTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Charge</dt>
            <dd className="font-semibold text-gray-900">{money(chargeTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Margin</dt>
            <dd className={`font-semibold ${margin < 0 ? "text-red-600" : "text-emerald-700"}`}>{money(margin)}</dd>
          </div>
        </dl>
      </div>

      {r.note && (
        <p className="mt-3 whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <span className="font-medium">Sub&apos;s note:</span> {r.note}
        </p>
      )}
      {(r.pm.sentAt || r.pm.answeredAt) && (
        <p className="mt-3 text-sm text-gray-600">
          {r.pm.sentAt && (
            <>
              Emailed {when(r.pm.sentAt)} to {r.pm.sentTo.join(", ")}.
            </>
          )}
          {r.pm.answeredAt && (
            <>
              {" "}
              <span className={r.status === "APPROVED" ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                {r.status === "APPROVED" ? "Approved" : "Denied"} {when(r.pm.answeredAt)}
              </span>
              {r.pm.denyReason ? `: ${r.pm.denyReason}` : "."}
            </>
          )}
        </p>
      )}
      {r.changeOrder && (
        <p className="mt-2 text-sm">
          <Link href={`/erp/projects/${projectId}/change-orders/${r.changeOrder.id}`} className="font-medium text-pink-600 hover:underline">
            {r.changeOrder.status === "VOID" ? "Change order (voided)" : "Open the change order"}
          </Link>
        </p>
      )}
      {r.cancelReason && <p className="mt-3 text-sm text-gray-600">Cancel reason: {r.cancelReason}</p>}
      {warning && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {warning}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {r.editable && !cancelling && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {dirty && (
            <>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? "Saving..." : r.status === "WAITING_PM" ? "Save and email the update" : "Save changes"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setLines(initialLines());
                  setSurchargeId(r.surcharge?.id ?? "");
                  setError(null);
                }}
                disabled={busy}
              >
                Undo
              </Button>
            </>
          )}
          {!dirty && (
            <Button size="sm" variant={r.status === "WAITING_PM" ? "secondary" : "primary"} onClick={() => act({ action: "send" })} disabled={busy || !canSend} title={r.blockers.length ? r.blockers.join(". ") : undefined}>
              {sendLabel}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setCancelling(true)} disabled={busy}>
            Cancel request
          </Button>
        </div>
      )}

      {r.editable && cancelling && (
        <div className="mt-4 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
          <label htmlFor={`cancel-${r.id}`} className="block text-sm font-medium text-gray-700">
            Reason for the sub (optional)
          </label>
          <textarea id={`cancel-${r.id}`} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900" />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy} onClick={async () => (await act({ action: "cancel", reason })) && setCancelling(false)}>
              {busy ? "Cancelling..." : "Cancel and tell the sub"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setCancelling(false)}>
              Back
            </Button>
          </div>
        </div>
      )}

      {r.answerable && !cancelling && !dirty && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {answering ? (
            <div className="w-full space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm text-gray-700">
                {answering === "APPROVED"
                  ? "This adds the change order to the unit with the sub's pay as its cost, and emails the sub and the team."
                  : r.status === "APPROVED"
                    ? "This voids its change order, removes the sub's cost, and tells the sub not to do it."
                    : "This tells the sub not to do it, and emails the team."}
              </p>
              {answering === "DENIED" && (
                <textarea
                  value={answerReason}
                  onChange={(e) => setAnswerReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Reason (optional, the sub sees it)"
                  aria-label="Reason"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              )}
              <div className="flex gap-2">
                <Button size="sm" variant={answering === "APPROVED" ? "primary" : "danger"} disabled={busy} onClick={async () => (await act({ action: "answer", answer: answering, reason: answerReason })) && setAnswering(null)}>
                  {busy ? "Saving..." : answering === "APPROVED" ? "Approve" : "Deny"}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAnswering(null)}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <>
              <span className="text-xs text-gray-500">{r.status === "APPROVED" || r.status === "DENIED" ? "Wrong answer?" : "Property manager answered by phone?"}</span>
              {r.status !== "APPROVED" && (
                <Button size="sm" variant="ghost" onClick={() => setAnswering("APPROVED")} disabled={busy}>
                  {r.status === "DENIED" ? "Change to approved" : "Mark approved"}
                </Button>
              )}
              {r.status !== "DENIED" && (
                <Button size="sm" variant="ghost" onClick={() => setAnswering("DENIED")} disabled={busy}>
                  {r.status === "APPROVED" ? "Change to denied" : "Mark denied"}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {r.events.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
            {showHistory ? "Hide history" : `History (${r.events.length})`}
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {r.events.map((e, i) => (
                <li key={i}>
                  <span className="text-gray-400">{when(e.at)}</span> <span className="font-medium text-gray-700">{e.actor}</span>: {e.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
