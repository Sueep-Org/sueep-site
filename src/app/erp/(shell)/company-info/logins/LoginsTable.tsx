"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import type { CompanyLoginRow } from "@/lib/erp/companyInfo";

/** How long a revealed password stays on screen before it masks itself again. */
const REVEAL_MS = 30_000;

export function LoginsTable({ logins }: { logins: CompanyLoginRow[] }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CompanyLoginRow | "new" | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toast = useToast();

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logins;
    return logins.filter((l) => [l.name, l.url ?? "", l.username ?? "", l.owner ?? "", l.notes ?? ""].some((s) => s.toLowerCase().includes(q)));
  }, [logins, query]);

  async function fetchPassword(login: CompanyLoginRow, action: "REVEAL" | "COPY"): Promise<string | null> {
    const res = await fetch(`/api/erp/company-info/logins/${login.id}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json().catch(() => ({}))) as { value?: string; error?: string };
    if (!res.ok || data.value == null) {
      toast(data.error ?? "Could not load the password.");
      return null;
    }
    return data.value;
  }

  function hide(id: string) {
    clearTimeout(timers.current[id]);
    setRevealed((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  }

  async function reveal(login: CompanyLoginRow) {
    if (revealed[login.id] != null) {
      hide(login.id);
      return;
    }
    const value = await fetchPassword(login, "REVEAL");
    if (value == null) return;
    setRevealed((r) => ({ ...r, [login.id]: value }));
    clearTimeout(timers.current[login.id]);
    timers.current[login.id] = setTimeout(() => hide(login.id), REVEAL_MS);
  }

  async function copy(text: string | null, what: string) {
    if (text == null) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied.`);
    } catch {
      toast("Could not copy. Your browser blocked the clipboard.");
    }
  }

  async function copyPassword(login: CompanyLoginRow) {
    copy(revealed[login.id] ?? (await fetchPassword(login, "COPY")), `${login.name} password`);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search logins…"
          aria-label="Search logins"
          className={`${inputClass.xs} w-72`}
        />
        <Button size="sm" onClick={() => setEditing("new")}>
          + Add login
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {logins.length === 0 ? "No logins yet." : "No logins match that search."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Site</th>
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    Password
                    <InfoTip text="Stored encrypted. Reveal shows it for 30 seconds. Every Reveal and Copy is logged." />
                  </span>
                </th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((l) => (
                <tr key={l.id} className="group align-top">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {l.url ? (
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-pink-600 hover:underline">
                          {l.name}
                        </a>
                      ) : (
                        <span className="font-medium text-gray-900">{l.name}</span>
                      )}
                      {l.notes && <InfoTip text={l.notes} />}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {l.username ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="break-all text-gray-900">{l.username}</span>
                        <Button variant="ghost" size="xs" onClick={() => copy(l.username, `${l.name} username`)}>
                          Copy
                        </Button>
                      </span>
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {l.hasPassword ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="font-mono text-gray-900">{revealed[l.id] ?? "••••••••"}</span>
                        <Button variant="ghost" size="xs" onClick={() => reveal(l)}>
                          {revealed[l.id] != null ? "Hide" : "Reveal"}
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => copyPassword(l)}>
                          Copy
                        </Button>
                      </span>
                    ) : (
                      <span className="text-gray-400">Not set</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{l.owner ?? ""}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="xs" onClick={() => setEditing(l)} className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <LoginForm login={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** 20 characters from letters, digits, and a few symbols most sites accept. */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_";
  const bytes = new Uint32Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function LoginForm({ login, onClose }: { login: CompanyLoginRow | null; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState({
    name: login?.name ?? "",
    url: login?.url ?? "",
    username: login?.username ?? "",
    password: "",
    owner: login?.owner ?? "",
    notes: login?.notes ?? "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(login ? `/api/erp/company-info/logins/${login.id}` : "/api/erp/company-info/logins", {
      method: login ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      // A blank password keeps the stored one.
      body: JSON.stringify(form),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    toast(login ? `${form.name} saved.` : `${form.name} added.`);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!login) return;
    const ok = await confirm({ title: `Delete ${login.name}?`, message: "The login and its saved password are removed. It can't be undone.", confirmLabel: "Delete" });
    if (!ok) return;
    const res = await fetch(`/api/erp/company-info/logins/${login.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete.");
      return;
    }
    toast(`${login.name} deleted.`);
    onClose();
    router.refresh();
  }

  const changed = login?.passwordChangedAt
    ? new Date(login.passwordChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="md">
      <h3 className="text-base font-semibold text-gray-900">{login ? `Edit ${login.name}` : "Add a login"}</h3>
      {/* autoComplete off so the browser doesn't offer to save these as the ERP's own login. */}
      <div className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass.default}>
            Site name
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. SAM.gov" autoComplete="off" className={inputClass.md} autoFocus />
          </label>
          <label className={labelClass.default}>
            Website
            <input value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" autoComplete="off" className={inputClass.md} />
          </label>
        </div>
        <label className={labelClass.default}>
          Username or email
          <input value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" className={inputClass.md} />
        </label>
        <div>
          <label className={labelClass.default}>
            Password
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder={login?.hasPassword ? "Leave blank to keep the current password" : ""}
              autoComplete="new-password"
              className={`${inputClass.md} font-mono`}
            />
          </label>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px]">
            <Button variant="ghost" size="xs" onClick={() => setShowPassword((s) => !s)}>
              {showPassword ? "Hide" : "Show"}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                set("password", generatePassword());
                setShowPassword(true);
              }}
            >
              Generate a strong one
            </Button>
            {changed && <span className="text-gray-400">Password last changed {changed}</span>}
          </div>
        </div>
        <label className={labelClass.default}>
          Owner
          <input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="Whose account, or who handles it" autoComplete="off" className={inputClass.md} />
        </label>
        <label className={labelClass.default}>
          <span className="inline-flex items-center gap-1">
            Notes
            <InfoTip text="Notes are not encrypted. Keep passwords and security answers in the Password field only." />
          </span>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="e.g. 2FA goes to the office phone" className={inputClass.md} />
        </label>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <div>
          {login && (
            <Button variant="ghost" size="sm" onClick={remove} className="text-red-600 hover:text-red-700">
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
