"use client";

import { useState } from "react";
import { Button, InfoTip, inputClass, useToast } from "@/app/erp/components/ui";
import { RequestCard } from "./RequestCard";
import type { RequestRow } from "./types";

export function RequestsView({
  open,
  closed,
  projects,
  generalLink,
  notifyEmail,
}: {
  open: RequestRow[];
  closed: RequestRow[];
  projects: { id: string; jobTitle: string }[];
  generalLink: string | null;
  notifyEmail: string;
}) {
  const toast = useToast();
  const [link, setLink] = useState(generalLink);
  const [email, setEmail] = useState(notifyEmail);
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function settings(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/erp/insurance/request-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Could not save", "error");
        return;
      }
      setLink(data.url);
      toast(message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    toast("Link copied.");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-xs font-medium text-gray-600">
            General request link
            <InfoTip text="For requests not tied to one project. They type the project, and you pick it here. Each project also has its own link on its COIs tab, which is better when you know the project." />
          </p>
          {link ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">{link}</code>
              <Button size="xs" onClick={() => copy(link)}>Copy</Button>
              <Button variant="ghost" size="xs" disabled={busy} onClick={() => settings({ resetLink: true }, "New link made. The old one no longer works.")}>
                New link
              </Button>
            </div>
          ) : (
            <Button size="xs" disabled={busy} onClick={() => settings({ createLink: true }, "Link created.")}>
              Create link
            </Button>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="notify-email" className="flex items-center gap-1 text-xs font-medium text-gray-600">
            Email new requests to
            <InfoTip align="right" text="Who gets an email when a request comes in. Separate several with commas. Leave blank for no emails." />
          </label>
          <div className="flex gap-2">
            <input id="notify-email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@sueep.com" className={`${inputClass.xs} flex-1`} />
            <Button size="xs" disabled={busy} onClick={() => settings({ notifyEmail: email }, "Saved.")}>
              Save
            </Button>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Open ({open.length})</h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">No open requests.</p>
        ) : (
          open.map((r) => <RequestCard key={r.id} request={r} projects={projects} />)
        )}
      </section>

      {closed.length > 0 && (
        <section className="space-y-3">
          <button type="button" onClick={() => setShowClosed((v) => !v)} className="text-sm font-medium text-gray-600 hover:text-gray-900">
            {showClosed ? "Hide" : "Show"} recent done and cancelled ({closed.length})
          </button>
          {showClosed && closed.map((r) => <RequestCard key={r.id} request={r} projects={projects} />)}
        </section>
      )}
    </div>
  );
}
