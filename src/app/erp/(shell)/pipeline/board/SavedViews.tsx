"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import type { Filters } from "./filters";

export type SavedView = {
  id: string;
  name: string;
  filters: unknown;
  closed: "recent" | "all";
  shared: boolean;
  mine: boolean;
  canEdit: boolean;
};

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    on ? "border-pink-300 bg-pink-50 text-pink-700" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
  }`;

/** Views people saved: chips after the quick views, plus Save view and Manage. */
export function SavedViews({
  pipeline,
  views,
  active,
  onPick,
  canSave,
  filters,
  closed,
  mayShare,
}: {
  pipeline: "post-con" | "janitorial";
  views: SavedView[];
  active: string | null;
  onPick: (v: SavedView) => void;
  /** Filters are set and don't match any view yet */
  canSave: boolean;
  filters: Filters;
  closed: "recent" | "all";
  mayShare: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);
  if (!views.length && !canSave) return null;
  return (
    <>
      {views.length > 0 && <span aria-hidden className="mx-0.5 h-4 w-px bg-gray-200" />}
      {views.map((v) => (
        <button key={v.id} type="button" onClick={() => onPick(v)} aria-pressed={active === v.id} className={chip(active === v.id)} title={v.shared ? "Shared with everyone" : "Only you see this view"}>
          {v.name}
          {v.shared && <span className="ml-1 text-[10px] text-gray-400">shared</span>}
        </button>
      ))}
      {canSave && (
        <button type="button" onClick={() => setSaving(true)} className="rounded-full border border-dashed border-pink-300 px-3 py-1 text-xs font-medium text-pink-700 hover:bg-pink-50">
          + Save view
        </button>
      )}
      {views.some((v) => v.canEdit) && (
        <button type="button" onClick={() => setManaging(true)} className="text-xs text-gray-500 hover:text-gray-800">
          Manage
        </button>
      )}
      {saving && <SaveViewModal pipeline={pipeline} filters={filters} closed={closed} mayShare={mayShare} onClose={() => setSaving(false)} />}
      {managing && <ManageViewsModal views={views.filter((v) => v.canEdit)} mayShare={mayShare} onClose={() => setManaging(false)} />}
    </>
  );
}

function SaveViewModal({ pipeline, filters, closed, mayShare, onClose }: { pipeline: string; filters: Filters; closed: string; mayShare: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/erp/pipeline/views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pipeline, name, filters, closed, shared }),
    }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) return toast(data?.error || "Couldn't save the view", "error");
    onClose();
    toast("View saved.");
    router.refresh();
  }
  return (
    <Modal open onClose={onClose} size="sm">
      <form onSubmit={save} className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Save view</h2>
        <p className="text-xs text-gray-500">Saves the filters and sort you have set now.</p>
        <div>
          <label className={labelClass.default} htmlFor="view-name">Name</label>
          <input id="view-name" autoFocus required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Big quotes going quiet" className={inputClass.md} />
        </div>
        {mayShare && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Share with everyone
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ManageViewsModal({ views, mayShare, onClose }: { views: SavedView[]; mayShare: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(views.map((v) => [v.id, v.name])));

  async function patch(id: string, body: Record<string, unknown>, done: string) {
    const res = await fetch(`/api/erp/pipeline/views/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) return toast(data?.error || "Couldn't save", "error");
    toast(done);
    router.refresh();
  }

  async function remove(v: SavedView) {
    if (!(await confirm({ message: `Delete the view "${v.name}"?${v.shared ? " It's shared, so it goes away for everyone." : ""}` }))) return;
    const res = await fetch(`/api/erp/pipeline/views/${v.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast("Couldn't delete", "error");
    toast("View deleted.");
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-gray-900">
          Manage views
          <InfoTip text="Rename or delete your views. Admins and the Business Manager can also share views and change shared ones. To change a view's filters, pick it, change the filters and save it as a new view." />
        </h2>
        <ul className="divide-y divide-gray-100">
          {views.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 py-2">
              <input
                value={names[v.id] ?? ""}
                onChange={(e) => setNames((n) => ({ ...n, [v.id]: e.target.value }))}
                onBlur={() => names[v.id]?.trim() && names[v.id].trim() !== v.name && void patch(v.id, { name: names[v.id] }, "View renamed.")}
                maxLength={40}
                aria-label="View name"
                className={`${inputClass.sm} min-w-0 flex-1`}
              />
              {mayShare && (
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input type="checkbox" checked={v.shared} onChange={(e) => void patch(v.id, { shared: e.target.checked }, e.target.checked ? "Shared with everyone." : "No longer shared.")} />
                  Shared
                </label>
              )}
              <Button variant="ghost" size="xs" onClick={() => void remove(v)}>Delete</Button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
