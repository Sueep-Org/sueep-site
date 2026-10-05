"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, InfoTip, Modal, inputClass, labelClass, useToast } from "@/app/erp/components/ui";
import { NOTIFICATION_GROUPS, TO_MODE_LABEL, type NotificationGroup, type ToMode } from "@/lib/notificationTypes";

type SettingValues = { enabled: boolean; to: string[]; cc: string[] };

export type SettingRow = {
  type: string;
  label: string;
  group: NotificationGroup;
  when: string;
  automatic: string | null;
  toMode: ToMode | null;
  ccEditable: boolean;
  alwaysOn: boolean;
  setting: SettingValues & { customized: boolean };
  defaults: SettingValues;
  lastSentAt: string | null;
  failedThisWeek: number;
};

async function save(type: string, body: unknown, method: "PUT" | "DELETE" = "PUT"): Promise<string | null> {
  try {
    const res = await fetch(`/api/erp/notifications/settings/${type}`, {
      method,
      headers: method === "PUT" ? { "content-type": "application/json" } : undefined,
      body: method === "PUT" ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return null;
    const json = await res.json().catch(() => ({}));
    return json.error ?? "Could not save";
  } catch {
    return "Network error";
  }
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

const list = (emails: string[]) => (emails.length ? emails.join(", ") : "nobody");

export function SettingsView({
  rows,
  backupPms,
  backupPmsCustomized,
  defaultBackupPms,
}: {
  rows: SettingRow[];
  backupPms: string[];
  backupPmsCustomized: boolean;
  defaultBackupPms: string[];
}) {
  const [editing, setEditing] = useState<SettingRow | null>(null);
  const offCount = rows.filter((r) => !r.setting.enabled).length;

  return (
    <div className="space-y-6">
      <BackupPmsCard current={backupPms} customized={backupPmsCustomized} defaults={defaultBackupPms} />

      {offCount > 0 && (
        <p className="text-sm text-gray-500">
          {offCount} email{offCount === 1 ? " is" : "s are"} turned off.
        </p>
      )}

      {NOTIFICATION_GROUPS.map((group) => {
        const groupRows = rows.filter((r) => r.group === group);
        if (!groupRows.length) return null;
        return (
          <section key={group} className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-800">{group}</h2>
            <ul className="divide-y divide-gray-100">
              {groupRows.map((row) => (
                <SettingRowView key={row.type} row={row} onEdit={() => setEditing(row)} />
              ))}
            </ul>
          </section>
        );
      })}

      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SettingRowView({ row, onEdit }: { row: SettingRow; onEdit: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { setting } = row;

  async function toggle() {
    setBusy(true);
    const err = await save(row.type, { enabled: !setting.enabled });
    setBusy(false);
    if (err) toast(err, "error");
    else {
      toast(`${row.label} turned ${setting.enabled ? "off" : "on"}`);
      router.refresh();
    }
  }

  const recipients = [
    row.automatic,
    row.toMode && (row.toMode === "recipients" ? list(setting.to) : setting.to.length ? `${TO_MODE_LABEL[row.toMode].toLowerCase()} ${list(setting.to)}` : null),
  ]
    .filter(Boolean)
    .join("; ");

  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 ${setting.enabled ? "" : "bg-gray-50"}`}>
      <button
        type="button"
        role="switch"
        aria-checked={setting.enabled}
        aria-label={`${row.label} ${setting.enabled ? "on" : "off"}`}
        disabled={busy || row.alwaysOn}
        title={row.alwaysOn ? "Always on, people need this email to get in" : undefined}
        onClick={toggle}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${setting.enabled ? "bg-pink-600" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${setting.enabled ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-medium ${setting.enabled ? "text-gray-900" : "text-gray-500"}`}>{row.label}</span>
          <InfoTip text={row.when} />
          {setting.customized && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Changed</span>}
        </div>
        <p className="truncate text-xs text-gray-500" title={recipients}>
          To: {recipients || "nobody"}
          {setting.cc.length > 0 && <span>. Copy: {setting.cc.join(", ")}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-gray-400">
        {row.failedThisWeek > 0 && (
          <Link href={`/erp/notifications/log?type=${row.type}&status=FAILED`} className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 hover:bg-red-200">
            {row.failedThisWeek} failed
          </Link>
        )}
        <Link href={`/erp/notifications/log?type=${row.type}`} className="hover:text-gray-600 hover:underline">
          {row.lastSentAt ? `Sent ${timeAgo(row.lastSentAt)}` : "Not sent yet"}
        </Link>
        {(row.toMode || row.ccEditable) && (
          <Button variant="secondary" size="xs" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
    </li>
  );
}

function EditDialog({ row, onClose }: { row: SettingRow; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [to, setTo] = useState(row.setting.to.join(", "));
  const [cc, setCc] = useState(row.setting.cc.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const err = await save(row.type, { to, cc });
    setBusy(false);
    if (err) return setError(err);
    toast(`${row.label} saved`);
    router.refresh();
    onClose();
  }

  async function reset() {
    setBusy(true);
    const err = await save(row.type, null, "DELETE");
    setBusy(false);
    if (err) return setError(err);
    toast(`${row.label} back to default`);
    router.refresh();
    onClose();
  }

  return (
    <Modal open onClose={onClose} size="md" dismissible={false}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{row.label}</h3>
          <p className="text-xs text-gray-500">{row.when}</p>
        </div>
        {row.automatic && (
          <p className="rounded-md bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">
            Always goes to: <span className="font-medium text-gray-800">{row.automatic}</span>
          </p>
        )}
        {row.toMode && (
          <div>
            <label className={labelClass.default} htmlFor="ns-to">
              {TO_MODE_LABEL[row.toMode]}
            </label>
            <input id="ns-to" className={inputClass.md} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@sueep.com, other@sueep.com" />
            <p className="mt-1 text-[11px] text-gray-400">Default: {list(row.defaults.to)}</p>
          </div>
        )}
        {row.ccEditable && (
          <div>
            <label className={labelClass.default} htmlFor="ns-cc">
              Copy (cc)
            </label>
            <input id="ns-cc" className={inputClass.md} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional" />
            <p className="mt-1 text-[11px] text-gray-400">Default: {list(row.defaults.cc)}</p>
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          {row.setting.customized && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={reset}>
              Reset to default
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function BackupPmsCard({ current, customized, defaults }: { current: string[]; customized: boolean; defaults: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(current.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = value.replace(/\s/g, "") !== current.join(",");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const err = await save("BACKUP_PMS", { to: value });
    setBusy(false);
    if (err) return setError(err);
    toast("Backup PMs saved");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-gray-800">Backup PMs</h2>
        <InfoTip text="Used when an email should go to a project's PM but no PM can be found: margin alerts, reschedules, and the daily turnover digest bcc." />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          className={`${inputClass.sm} min-w-[16rem] flex-1`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Backup PM emails"
          placeholder="name@sueep.com, other@sueep.com"
        />
        {dirty && (
          <Button type="submit" size="xs" disabled={busy}>
            Save
          </Button>
        )}
      </div>
      {!customized && <p className="mt-1 text-[11px] text-gray-400">Default: {list(defaults)}</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </form>
  );
}
