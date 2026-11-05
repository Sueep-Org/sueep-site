"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { APP_LIST_INFO, type AppListId, type ListItem } from "@/lib/erp/appLists";

/** One editable dropdown list: rename, hide, reorder, add. Hidden items stay so old records keep their label. */
export function ListEditor({ id, items, saved }: { id: AppListId; items: ListItem[]; saved: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const info = APP_LIST_INFO[id];
  const [rows, setRows] = useState<ListItem[]>(items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(rows) !== JSON.stringify(items);

  const update = (i: number, patch: Partial<ListItem>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  function move(i: number, step: -1 | 1) {
    setRows((list) => {
      const next = [...list];
      const t = i + step;
      if (t < 0 || t >= next.length) return list;
      [next[i], next[t]] = [next[t]!, next[i]!];
      return next;
    });
  }

  async function send(method: "PUT" | "DELETE") {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/erp/settings/lists/${id}`, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "PUT" ? JSON.stringify({ items: rows }) : undefined,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not save. Try again.");
    toast(method === "PUT" ? `${info.label} saved` : `${info.label} back to default`);
    if (method === "DELETE") window.location.reload();
    else router.refresh();
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
        {info.label}
        <InfoTip text={`${info.info} Hide an item to stop offering it; records that already use it keep showing it.`} />
      </div>
      <ul className="mt-3 max-w-xl space-y-1.5">
        {rows.map((r, i) => {
          const locked = info.locked?.includes(r.value);
          return (
            <li key={`${r.value}-${i}`} className="flex items-center gap-2">
              <div className="flex flex-col">
                <button type="button" className="text-[10px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-30" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label="Move up">
                  ▲
                </button>
                <button type="button" className="text-[10px] leading-none text-gray-400 hover:text-gray-700 disabled:opacity-30" onClick={() => move(i, 1)} disabled={busy || i === rows.length - 1} aria-label="Move down">
                  ▼
                </button>
              </div>
              <input
                className={`${inputClass.sm} flex-1 ${r.hidden ? "text-gray-400 line-through" : ""}`}
                value={r.label}
                onChange={(e) => update(i, { label: e.target.value })}
                aria-label="Name"
                disabled={busy}
              />
              {locked ? (
                <span className="w-14 text-[11px] text-gray-400" title="The ERP depends on this one, so it can't be hidden">
                  Needed
                </span>
              ) : (
                <button type="button" className="w-14 text-xs text-gray-500 hover:text-gray-800" onClick={() => update(i, { hidden: !r.hidden })} disabled={busy}>
                  {r.hidden ? "Show" : "Hide"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" type="button" disabled={busy} onClick={() => setRows((list) => [...list, { value: "", label: "" }])}>
          + Add
        </Button>
        {dirty && (
          <>
            <Button size="sm" type="button" disabled={busy} onClick={() => send("PUT")}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => setRows(items)}>
              Cancel
            </Button>
          </>
        )}
        {saved && !dirty && (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await confirm({ message: `Put ${info.label.toLowerCase()} back to the built-in list? Added items are removed from the list (records that use them keep their text).`, confirmLabel: "Reset" })) send("DELETE");
            }}
          >
            Reset to default
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
