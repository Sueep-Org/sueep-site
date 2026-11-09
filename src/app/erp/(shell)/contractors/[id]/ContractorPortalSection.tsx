"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/app/erp/components/ui";

type Props = {
  id: string;
  email: string | null;
  active: boolean;
  /** Full portal URL, null when they don't have one yet */
  portalUrl: string | null;
  lastSeenAt: string | null;
  devices: number;
  /** Turned off on the Users page; turned back on there too */
  turnedOff: boolean;
  canManage: boolean;
};

function formatDt(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** The sub's own jobs page (/sub/[token]): email it to them, or replace the link. */
export function ContractorPortalSection({ id, email, active, portalUrl, lastSeenAt, devices, turnedOff, canManage }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"email" | "new" | null>(null);
  const [ok, setOk] = useState("");
  const [error, setError] = useState("");

  async function run(action: "email" | "new") {
    if (action === "new" && !(await confirm({ message: "Make a new link? The old link stops working and they'll need to sign in again on every phone.", confirmLabel: "Make new link" }))) return;
    setBusy(action);
    setOk("");
    setError("");
    const res = await fetch(`/api/erp/contractors/${id}/portal-link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Couldn't send");
      return;
    }
    setOk(`Portal link sent to ${email}`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {portalUrl ? (
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-gray-500">Link</dt>
          <dd className="break-all">
            <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
              {portalUrl}
            </a>
          </dd>
          <dt className="text-gray-500">Last opened</dt>
          <dd className="text-gray-800">{formatDt(lastSeenAt)}</dd>
          <dt className="text-gray-500">Signed-in phones</dt>
          <dd className="text-gray-800">{devices}</dd>
        </dl>
      ) : (
        <p className="text-xs text-gray-500">No portal link yet.</p>
      )}

      {!email && <p className="text-xs text-amber-600">Add an email address first. The portal signs them in by email.</p>}
      {!active && <p className="text-xs text-amber-600">Inactive contractors can&apos;t open their portal.</p>}

      {turnedOff && (
        <p className="text-xs text-gray-600">
          Their page is turned off. Turn it back on from{" "}
          <a href="/erp/users?tab=Subs" className="text-pink-600 hover:underline">
            User Management
          </a>
          .
        </p>
      )}

      {canManage && !turnedOff && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void run("email")}
            disabled={!!busy || !email || !active}
            className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {busy === "email" ? "Sending…" : "Email portal link"}
          </button>
          {portalUrl && (
            <button
              type="button"
              onClick={() => void run("new")}
              disabled={!!busy || !email || !active}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === "new" ? "Sending…" : "Make new link"}
            </button>
          )}
        </div>
      )}

      {ok && <p className="text-xs text-emerald-600">{ok}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
