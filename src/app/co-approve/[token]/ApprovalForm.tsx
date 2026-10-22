"use client";

import { useState } from "react";
import type { ApprovalView } from "@/lib/erp/subCoApproval";

function money(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 });
}

/**
 * The property manager's Approve / Deny for one change order. Nothing is
 * recorded until a button is pressed (email scanners open links on their own).
 * Shows our charge only.
 */
export function ApprovalForm({ token, view, preselect }: { token: string; view: ApprovalView; preselect: "approve" | "deny" | null }) {
  const [state, setState] = useState<ApprovalView["state"]>(view.state);
  const [denying, setDenying] = useState(preselect === "deny" && view.state === "open");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(a: "APPROVED" | "DENIED") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/co-approve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: a, reason: a === "DENIED" ? reason : null }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; state?: ApprovalView["state"] } | null;
      if (!res.ok || !data?.state) return setError(data?.error ?? "Couldn't save your answer. Try again.");
      setState(data.state);
      setDenying(false);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const card = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";
  const answeredOn = view.answeredAt ? new Date(view.answeredAt).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" }) : null;

  return (
    <div className="mt-3 space-y-4">
      <div className={card}>
        <h1 className="text-lg font-semibold text-gray-900">Change order for approval</h1>
        <p className="mt-1 text-sm text-gray-700">
          Extra work our crew found at <strong>{view.unit}</strong>
          {view.address ? <span className="text-gray-500"> ({view.address})</span> : null}.
        </p>
      </div>

      {view.photoIds.length > 0 && (
        <div className={`${card} grid grid-cols-2 gap-2 sm:grid-cols-3`}>
          {view.photoIds.map((id) => (
            <a key={id} href={`/api/co-approve/${token}/photos/${id}`} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/co-approve/${token}/photos/${id}`} alt="Photo of the work" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className={card}>
        <ul className="divide-y divide-gray-100 text-sm">
          {view.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span className="text-gray-900">
                {l.quantity > 1 ? `${l.quantity} × ` : ""}
                {l.label}
              </span>
              <span className="shrink-0 text-gray-700">{money(l.totalCents)}</span>
            </li>
          ))}
          {view.surcharge && (
            <li className="flex justify-between gap-3 py-2">
              <span className="text-gray-900">
                {view.surcharge.label} (+{view.surcharge.percent}%)
              </span>
              <span className="shrink-0 text-gray-700">{money(view.surcharge.cents)}</span>
            </li>
          )}
          <li className="flex justify-between gap-3 pt-3">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="text-lg font-semibold text-gray-900">{money(view.totalCents)}</span>
          </li>
        </ul>
      </div>

      <div className={card}>
        {state === "approved" && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Approved{answeredOn && view.state === "approved" ? ` on ${answeredOn}` : ""}. Thanks, we&apos;ll get it done.</p>
        )}
        {state === "denied" && (
          <p className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">
            Denied{answeredOn && view.state === "denied" ? ` on ${answeredOn}` : ""}. We won&apos;t do this work.
            {view.denyReason && view.state === "denied" ? ` Reason: ${view.denyReason}` : ""}
          </p>
        )}
        {state === "withdrawn" && <p className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700">We withdrew this request, so there&apos;s nothing to answer.</p>}
        {state === "updating" && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">We&apos;re updating this request. You&apos;ll get a new email shortly.</p>}

        {state === "open" && !denying && (
          <>
            <p className="text-sm font-medium text-gray-900">Can we do this work?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => answer("APPROVED")}
                className={`rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 ${preselect === "approve" ? "ring-2 ring-emerald-300 ring-offset-2" : ""}`}
              >
                {busy ? "Saving…" : `Approve ${money(view.totalCents)}`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDenying(true)}
                className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </>
        )}

        {state === "open" && denying && (
          <div className="space-y-2">
            <label htmlFor="deny-reason" className="block text-sm font-medium text-gray-700">
              Why? (optional)
            </label>
            <textarea
              id="deny-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => answer("DENIED")} className="rounded-md bg-gray-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50">
                {busy ? "Saving…" : "Deny"}
              </button>
              <button type="button" disabled={busy} onClick={() => setDenying(false)} className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700">
                Back
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      {view.contact && (view.contact.name || view.contact.phone || view.contact.email) && (
        <p className="px-1 text-sm text-gray-600">
          Questions? {view.contact.name ?? "Sueep"}
          {view.contact.phone ? (
            <>
              ,{" "}
              <a href={`tel:${view.contact.phone}`} className="text-pink-600 hover:underline">
                {view.contact.phone}
              </a>
            </>
          ) : null}
          {view.contact.email ? (
            <>
              ,{" "}
              <a href={`mailto:${view.contact.email}`} className="text-pink-600 hover:underline">
                {view.contact.email}
              </a>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
