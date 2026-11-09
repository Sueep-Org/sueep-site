"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip, useAskText, useConfirm, useToast } from "@/app/erp/components/ui";
import type { ActivityItem, PortalKind, PortalStatus, PortalUserRow } from "@/lib/erp/portalUsers";

type Filter = "ALL" | PortalStatus;

const STATUS_LOOK: Record<PortalStatus, { label: string; cls: string }> = {
  ACTIVE: { label: "Using it", cls: "bg-emerald-50 text-emerald-700" },
  NEVER_OPENED: { label: "Never opened", cls: "bg-amber-50 text-amber-700" },
  OFF: { label: "Turned off", cls: "bg-gray-200 text-gray-700" },
  NO_LINK: { label: "No link", cls: "bg-gray-100 text-gray-500" },
};

function when(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function Activity({ kind, id }: { kind: PortalKind; id: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/erp/portal-users/${kind}/${id}/activity`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { items: ActivityItem[] }) => live && setItems(d.items))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [kind, id]);

  if (failed) return <p className="text-xs text-red-500">Couldn&apos;t load activity.</p>;
  if (!items) return <p className="text-xs text-gray-400">Loading…</p>;
  if (items.length === 0) return <p className="text-xs text-gray-500">Nothing yet.</p>;
  return (
    <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
      {items.map((i, n) => (
        <li key={n} className="flex gap-3">
          <span className="w-36 shrink-0 text-gray-400">{when(i.at)}</span>
          <span className="text-gray-700">{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Subs or property managers with a private page: status, activity, turn off and on. */
export function PortalUsersTable({ kind, rows }: { kind: PortalKind; rows: PortalUserRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const askText = useAskText();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const who = kind === "sub" ? "sub" : "property manager";

  const filters: Filter[] = kind === "sub" ? ["ALL", "ACTIVE", "NEVER_OPENED", "OFF", "NO_LINK"] : ["ALL", "ACTIVE", "NEVER_OPENED", "OFF"];
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const q = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) => (filter === "ALL" || r.status === filter) && (!q || [r.name, r.company, r.email].some((v) => v?.toLowerCase().includes(q))),
  );

  async function act(row: PortalUserRow, action: "off" | "on" | "sign-out") {
    let reason: string | null = null;
    if (action === "off") {
      reason = await askText({
        title: `Turn off ${row.name}'s page?`,
        message: "Their link stops working right away and their phones are signed out. Nothing is deleted. Why?",
        placeholder: "Reason",
        confirmLabel: "Turn off",
      });
      if (!reason?.trim()) return;
    } else if (action === "on") {
      const ok = await confirm({ message: `Turn ${row.name}'s page ${row.status === "NO_LINK" ? "on" : "back on"}? They get a new link by email.`, confirmLabel: "Turn on", danger: false });
      if (!ok) return;
    } else {
      const ok = await confirm({ message: `Sign ${row.name} out of every phone? They'll need a new code to get back in.`, confirmLabel: "Sign out" });
      if (!ok) return;
    }
    setBusy(row.id);
    try {
      const res = await fetch(`/api/erp/portal-users/${kind}/${row.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { note?: string; error?: string };
      if (!res.ok) toast(data.error ?? "Something went wrong", "error");
      else toast(data.note ?? "Done");
      router.refresh();
    } catch {
      toast("Network error", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f ? "border-pink-500 bg-pink-50 text-pink-700" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            {f === "ALL" ? "All" : STATUS_LOOK[f].label} <span className="text-gray-400">{counts[f] ?? 0}</span>
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="ml-auto w-48 rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Name</th>
              <th className="px-4 py-2.5 text-left font-semibold">Page</th>
              <th className="px-4 py-2.5 text-left font-semibold">Last opened</th>
              <th className="px-4 py-2.5 text-left font-semibold">
                <span className="inline-flex items-center gap-1">
                  Phones <InfoTip text="Devices signed in to their page right now." />
                </span>
              </th>
              <th className="px-4 py-2.5 text-left font-semibold">
                <span className="inline-flex items-center gap-1">
                  30 days <InfoTip align="right" text={kind === "sub" ? "Sign-ins, schedule answers and change order requests in the last 30 days." : "Sign-ins, turnover requests and change requests in the last 30 days."} />
                </span>
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r) => {
              const look = STATUS_LOOK[r.status];
              const isOpen = open === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className={`cursor-pointer hover:bg-gray-50 ${isOpen ? "bg-gray-50" : ""}`} onClick={() => setOpen(isOpen ? null : r.id)}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{r.name}</p>
                      {(r.company || r.email) && <p className="text-xs text-gray-500">{[r.company, r.email].filter(Boolean).join(" · ")}</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${look.cls}`} title={r.offReason ? `Why: ${r.offReason}` : undefined}>
                        {look.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{r.status === "NO_LINK" ? "-" : when(r.lastSeenAt)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{r.devices}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{r.recentActions}</td>
                    <td className="px-4 py-2.5 text-right text-xs" onClick={(e) => e.stopPropagation()}>
                      {r.status === "OFF" || r.status === "NO_LINK" ? (
                        <button
                          type="button"
                          disabled={busy === r.id || !r.email}
                          title={!r.email ? "Add an email address first" : undefined}
                          onClick={() => void act(r, "on")}
                          className="font-medium text-pink-600 hover:text-pink-700 disabled:opacity-40"
                        >
                          {busy === r.id ? "Working…" : r.status === "OFF" ? "Turn back on" : "Send link"}
                        </button>
                      ) : (
                        <button type="button" disabled={busy === r.id} onClick={() => void act(r, "off")} className="font-medium text-red-500 hover:text-red-700 disabled:opacity-40">
                          {busy === r.id ? "Working…" : "Turn off page"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50">
                      <td colSpan={6} className="px-4 pb-4 pt-1">
                        <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Activity</p>
                            <Activity kind={kind} id={r.id} />
                          </div>
                          <div className="space-y-2 text-xs md:w-64">
                            {r.status === "OFF" && (
                              <p className="rounded-md bg-white px-3 py-2 text-gray-700">
                                Turned off{r.offAt ? ` ${when(r.offAt)}` : ""}
                                {r.offBy ? ` by ${r.offBy}` : ""}
                                {r.offReason ? `: ${r.offReason}` : ""}
                              </p>
                            )}
                            {r.url && r.status !== "OFF" && (
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="block break-all text-pink-600 hover:underline">
                                Open their page
                              </a>
                            )}
                            {r.devices > 0 && r.status !== "OFF" && (
                              <button type="button" disabled={busy === r.id} onClick={() => void act(r, "sign-out")} className="block text-gray-600 hover:text-gray-900 disabled:opacity-40">
                                Sign out of every phone
                              </button>
                            )}
                            <a href={r.profileHref} className="block text-gray-600 hover:text-gray-900">
                              {kind === "sub" ? "Contractor profile" : "Property Managers page"}
                            </a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No {who}s here.</p>}
      </div>
    </div>
  );
}
