"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { asUrl, sectionsForTab, type CompanyInfoRow, type CompanyInfoSection, type CompanyInfoTab } from "@/lib/erp/companyInfo";
import { expiryStatus } from "@/lib/erp/insurance";
import { ExpiryBadge } from "../insurance/badges";

/** How long a revealed value stays on screen before it masks itself again. */
const REVEAL_MS = 30_000;

type Editing = { row: CompanyInfoRow } | { section: CompanyInfoSection; label?: string };

/** Label/value cards for one Company Info tab, with search when `searchable`. */
export function FieldCards({ rows, tab, searchable = false }: { rows: CompanyInfoRow[]; tab: CompanyInfoTab; searchable?: boolean }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toast = useToast();

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => [r.label, r.value ?? "", r.comment ?? "", r.link ?? ""].some((s) => s.toLowerCase().includes(q)));
  }, [rows, q]);

  async function fetchSecret(row: CompanyInfoRow, action: "REVEAL" | "COPY"): Promise<string | null> {
    const res = await fetch(`/api/erp/company-info/fields/${row.id}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      value?: string;
      error?: string;
    };
    if (!res.ok || data.value == null) {
      toast(data.error ?? "Could not load that value.");
      return null;
    }
    return data.value;
  }

  async function reveal(row: CompanyInfoRow) {
    if (revealed[row.id] != null) {
      hide(row.id);
      return;
    }
    const value = await fetchSecret(row, "REVEAL");
    if (value == null) return;
    setRevealed((r) => ({ ...r, [row.id]: value }));
    clearTimeout(timers.current[row.id]);
    timers.current[row.id] = setTimeout(() => hide(row.id), REVEAL_MS);
  }

  function hide(id: string) {
    clearTimeout(timers.current[id]);
    setRevealed((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  }

  async function copy(row: CompanyInfoRow) {
    const value = row.sensitive ? (revealed[row.id] ?? (await fetchSecret(row, "COPY"))) : row.value;
    if (value == null) return;
    try {
      await navigator.clipboard.writeText(value);
      toast(`${row.label} copied.`);
    } catch {
      toast("Could not copy. Your browser blocked the clipboard.");
    }
  }

  return (
    <section className="space-y-3">
      {searchable && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company info…"
            aria-label="Search company info"
            className={`${inputClass.xs} w-72`}
          />
        </div>
      )}

      {q && visible.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">Nothing matches that search.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {sectionsForTab(tab).map((section) => {
          const sectionRows = visible.filter((r) => r.section === section.id);
          if (q && sectionRows.length === 0) return null;
          return (
            <div key={section.id} className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-gray-900">{section.label}</h2>
                <Button variant="ghost" size="xs" onClick={() => setEditing({ section: section.id })}>
                  + Add
                </Button>
              </div>
              {sectionRows.length === 0 ? (
                <p className="px-4 py-3 text-xs text-gray-400">Nothing here yet.</p>
              ) : (
                <dl className="divide-y divide-gray-100">
                  {sectionRows.map((row) => (
                    <FieldRow
                      key={row.id}
                      row={row}
                      revealedValue={revealed[row.id]}
                      onEdit={() => setEditing({ row })}
                      onReveal={() => reveal(row)}
                      onCopy={() => copy(row)}
                    />
                  ))}
                </dl>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <FieldForm
          key={"row" in editing ? editing.row.id : `new-${editing.section}-${editing.label ?? ""}`}
          editing={editing}
          tab={tab}
          onClose={() => setEditing(null)}
          onAddAnother={(section, label) => setEditing({ section, label })}
        />
      )}
    </section>
  );
}

function FieldRow({
  row,
  revealedValue,
  onEdit,
  onReveal,
  onCopy,
}: {
  row: CompanyInfoRow;
  revealedValue: string | undefined;
  onEdit: () => void;
  onReveal: () => void;
  onCopy: () => void;
}) {
  const hasValue = row.sensitive ? row.masked != null : !!row.value;
  const url = !row.sensitive && row.value ? asUrl(row.value) : null;

  let shown: React.ReactNode;
  if (!hasValue) shown = <span className="text-gray-400">Not set</span>;
  else if (row.sensitive) shown = <span className="font-mono">{revealedValue ?? row.masked}</span>;
  else if (url)
    shown = (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
        {row.value}
      </a>
    );
  else shown = <span className="whitespace-pre-wrap">{row.value}</span>;

  return (
    <div className="group flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2 sm:flex-nowrap">
      <dt className="flex w-full shrink-0 items-center gap-1.5 text-xs font-medium text-gray-500 sm:w-44 sm:pt-0.5">
        <span>{row.label}</span>
        {row.sensitive && <LockIcon />}
        {row.comment && <InfoTip text={row.comment} />}
      </dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm text-gray-900">
        <span className="min-w-0 break-words">{shown}</span>
        {row.link && (
          <a
            href={row.link}
            target="_blank"
            rel="noopener noreferrer"
            title={row.link}
            className="inline-flex items-center gap-1 text-xs font-medium text-pink-600 hover:underline"
          >
            <ExternalIcon />
            Open
          </a>
        )}
        {row.expiresAt && (
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
            <ExpiryBadge status={expiryStatus(new Date(`${row.expiresAt}T00:00:00.000Z`))} />
            {new Date(`${row.expiresAt}T00:00:00.000Z`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
          </span>
        )}
      </dd>
      <div className="flex shrink-0 items-center gap-3 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        {row.sensitive && hasValue && (
          <Button variant="ghost" size="xs" onClick={onReveal}>
            {revealedValue != null ? "Hide" : "Reveal"}
          </Button>
        )}
        {hasValue && (
          <Button variant="ghost" size="xs" onClick={onCopy}>
            Copy
          </Button>
        )}
        <Button variant="ghost" size="xs" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18v4.5M18 6l-7.5 7.5M10.5 7.5H6.75A.75.75 0 006 8.25v9a.75.75 0 00.75.75h9a.75.75 0 00.75-.75V13.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-label="Encrypted">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75M6 21h12a1.5 1.5 0 001.5-1.5v-7.5A1.5 1.5 0 0018 10.5H6a1.5 1.5 0 00-1.5 1.5v7.5A1.5 1.5 0 006 21z"
      />
    </svg>
  );
}

function FieldForm({
  editing,
  tab,
  onClose,
  onAddAnother,
}: {
  editing: Editing;
  tab: CompanyInfoTab;
  onClose: () => void;
  /** Opens a blank row with the same name, e.g. a second NAICS code */
  onAddAnother: (section: CompanyInfoSection, label: string) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const row = "row" in editing ? editing.row : null;
  const storedSecret = !!row?.sensitive && row.masked != null;

  const [form, setForm] = useState({
    section: row?.section ?? ("section" in editing ? editing.section : sectionsForTab(tab)[0].id),
    label: row?.label ?? ("label" in editing ? (editing.label ?? "") : ""),
    value: row?.sensitive ? "" : (row?.value ?? ""),
    sensitive: row?.sensitive ?? false,
    comment: row?.comment ?? "",
    link: row?.link ?? "",
    expiresAt: row?.expiresAt ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    setError("");
    // A blank value on an already-encrypted row keeps what's stored.
    const keepSecret = storedSecret && form.sensitive && !form.value.trim();
    const res = await fetch(row ? `/api/erp/company-info/fields/${row.id}` : "/api/erp/company-info/fields", {
      method: row ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        value: keepSecret ? undefined : form.value,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    toast(row ? `${form.label} saved.` : `${form.label} added.`);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!row) return;
    const ok = await confirm({
      title: `Delete ${row.label}?`,
      message: "This removes the row and its value. It can't be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const res = await fetch(`/api/erp/company-info/fields/${row.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Could not delete.");
      return;
    }
    toast(`${row.label} deleted.`);
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="md">
      <h3 className="text-base font-semibold text-gray-900">{row ? `Edit ${row.label}` : "Add a row"}</h3>
      <div className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass.default}>
            Name
            <input value={form.label} onChange={(e) => set("label", e.target.value)} className={inputClass.md} autoFocus={!row} />
          </label>
          <label className={labelClass.default}>
            Section
            <select value={form.section} onChange={(e) => set("section", e.target.value as CompanyInfoSection)} className={inputClass.md}>
              {sectionsForTab(tab).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClass.default}>
          Value
          {form.sensitive ? (
            <input
              type="password"
              autoComplete="new-password"
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder={storedSecret ? "Leave blank to keep the current value" : ""}
              className={inputClass.md}
              autoFocus={!!row}
            />
          ) : (
            <textarea value={form.value} onChange={(e) => set("value", e.target.value)} rows={2} className={inputClass.md} autoFocus={!!row} />
          )}
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={form.sensitive}
            onChange={(e) => set("sensitive", e.target.checked)}
            className="h-3.5 w-3.5 text-pink-600"
          />
          Encrypt and hide this value
          <InfoTip text="For tax IDs, account numbers, and anything else private. The value is stored encrypted, shown as dots, and every Reveal or Copy is logged." />
        </label>

        <label className={labelClass.default}>
          Comment
          <textarea value={form.comment} onChange={(e) => set("comment", e.target.value)} rows={2} className={inputClass.md} />
        </label>

        <label className={labelClass.default}>
          <span className="inline-flex items-center gap-1">
            Link
            <InfoTip text="A web page for this row, like a license lookup or a portal. Shows as a clickable Open next to the value." />
          </span>
          <input
            type="url"
            inputMode="url"
            value={form.link}
            onChange={(e) => set("link", e.target.value)}
            placeholder="https://"
            className={inputClass.md}
          />
        </label>

        <label className={labelClass.default}>
          <span className="inline-flex items-center gap-1">
            Expires
            <InfoTip text="For licenses, registrations, and certifications. Shows a warning 30 days out." />
          </span>
          <input type="date" value={form.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} className={inputClass.md} />
        </label>

        {row?.updatedByEmail && (
          <p className="text-[11px] text-gray-400">
            Last changed by {row.updatedByEmail} on{" "}
            {new Date(row.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-3">
          {row && (
            <>
              <Button variant="ghost" size="sm" onClick={remove} className="text-red-600 hover:text-red-700">
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onAddAnother(row.section, row.label)}>
                Add another {row.label}
              </Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !form.label.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
