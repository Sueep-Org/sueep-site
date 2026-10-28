"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, useConfirm } from "@/app/erp/components/ui";

export type ConnectionInfo = {
  status: "CONNECTED" | "NEEDS_RECONNECT";
  environment: string;
  companyName: string | null;
  connectedBy: string | null;
  connectedAt: string;
  lastError: string | null;
  lastSyncAt: string | null;
} | null;

/** What came back from Intuit's sign-in, from ?qbo= on the page URL. */
const RESULT_TEXT: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Connected to QuickBooks.", ok: true },
  declined: { text: "The connection wasn't approved in QuickBooks, so nothing changed.", ok: false },
  expired: { text: "That sign-in link expired or didn't come from this browser. Click Connect again.", ok: false },
  forbidden: { text: "Only an Admin can connect QuickBooks.", ok: false },
  error: { text: "Couldn't connect to QuickBooks.", ok: false },
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function QuickBooksConnection({
  connection,
  configured,
  canConnect,
  result,
  detail,
}: {
  connection: ConnectionInfo;
  configured: boolean;
  canConnect: boolean;
  result: string | null;
  detail: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"test" | "sync" | "disconnect" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(
    result && RESULT_TEXT[result] ? { text: `${RESULT_TEXT[result].text}${detail ? ` ${detail}` : ""}`, ok: RESULT_TEXT[result].ok } : null,
  );

  async function test() {
    setBusy("test");
    setMessage(null);
    try {
      const res = await fetch("/api/erp/quickbooks/test", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { companyName?: string | null; error?: string };
      setMessage(res.ok ? { text: `Working. QuickBooks company: ${data.companyName ?? "(no name)"}.`, ok: true } : { text: data.error ?? "Test failed.", ok: false });
      router.refresh();
    } catch {
      setMessage({ text: "Network error.", ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    setMessage(null);
    try {
      const res = await fetch("/api/erp/quickbooks/sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        environment?: string;
        pnl?: { months: number; accounts: number; totalsMatch: boolean };
        ar?: { customers: number; totalCents: number; totalsMatch: boolean };
      };
      if (!res.ok || !data.pnl || !data.ar) {
        setMessage({ text: data.error ?? "Sync failed.", ok: false });
      } else {
        const read = `Read ${data.pnl.months} months of P&L (${data.pnl.accounts} accounts) and A/R for ${data.ar.customers} customers, ${(data.ar.totalCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} owed.`;
        const match = data.pnl.totalsMatch && data.ar.totalsMatch ? " Totals match QuickBooks." : " Some totals didn't match QuickBooks, so nothing was saved.";
        const where = data.saved ? " Saved." : data.environment === "sandbox" ? " Sandbox: preview only, nothing saved." : "";
        setMessage({ text: read + match + where, ok: data.pnl.totalsMatch && data.ar.totalsMatch });
      }
      router.refresh();
    } catch {
      setMessage({ text: "Network error.", ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    const yes = await confirm({
      title: "Disconnect QuickBooks?",
      message: "The ERP stops reading from QuickBooks. Reports already brought in stay. You can connect again any time.",
      confirmLabel: "Disconnect",
    });
    if (!yes) return;
    setBusy("disconnect");
    setMessage(null);
    try {
      const res = await fetch("/api/erp/quickbooks/disconnect", { method: "POST" });
      setMessage(res.ok ? { text: "Disconnected from QuickBooks.", ok: true } : { text: "Couldn't disconnect.", ok: false });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const needsReconnect = connection?.status === "NEEDS_RECONNECT";
  const connectLabel = connection ? "Reconnect QuickBooks" : "Connect QuickBooks";

  return (
    <section className={`space-y-2 rounded-lg border px-4 py-3 shadow-sm ${needsReconnect ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Connection</h2>
        <InfoTip text="Read-only. Every night the ERP reads the Profit and Loss (by month, cash basis, from January last year) and today's A/R Aging from QuickBooks. It never changes anything there. A sandbox connection only previews, so test data never replaces real numbers. Only an Admin can connect or disconnect." wide />
        {connection ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${needsReconnect ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
            {needsReconnect ? "Needs reconnecting" : "Connected"}
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">Not connected</span>
        )}
        {connection?.environment === "sandbox" ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700" title="Intuit's test company, not Sueep's books">Sandbox</span>
        ) : null}
      </div>

      {connection ? (
        <p className="text-sm text-gray-600">
          {connection.companyName ?? "Company name not read yet"} · {connection.lastSyncAt ? `synced ${when(connection.lastSyncAt)}` : "not synced yet"}
          {connection.lastError ? <span className="block text-amber-800">Last problem: {connection.lastError}</span> : null}
        </p>
      ) : (
        <p className="text-sm text-gray-600">Not connected. Until it is, reports can be uploaded below.</p>
      )}

      {!configured ? <p className="text-sm text-amber-800">The QuickBooks app keys aren&apos;t set on this server yet.</p> : null}
      {message ? <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`} role="status">{message.text}</p> : null}

      <div className="flex flex-wrap gap-2">
        {canConnect && configured && (!connection || needsReconnect) ? (
          // A plain link, not client navigation: it leaves the ERP for Intuit's sign-in page.
          <a href="/api/erp/quickbooks/connect" className="inline-flex items-center rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-700">
            {connectLabel}
          </a>
        ) : null}
        {connection && !needsReconnect ? (
          <Button size="xs" variant="secondary" type="button" onClick={test} disabled={busy !== null}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </Button>
        ) : null}
        {connection && !needsReconnect ? (
          <Button size="xs" variant="secondary" type="button" onClick={sync} disabled={busy !== null}>
            {busy === "sync" ? "Syncing…" : "Sync now"}
          </Button>
        ) : null}
        {canConnect && connection ? (
          <Button size="xs" variant="secondary" type="button" onClick={disconnect} disabled={busy !== null}>
            {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
