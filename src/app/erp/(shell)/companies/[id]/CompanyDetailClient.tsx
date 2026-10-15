"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { SearchableSelect, type SearchableSelectOption } from "@/app/erp/components/SearchableSelect";
import { CompanyForm, type CompanyFormValues } from "@/app/erp/components/companies/CompanyForm";
import type { CompanyContactRow } from "@/lib/erp/clientCompanies";

export function CompanyEditButton({ company }: { company: CompanyFormValues }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && <CompanyForm company={company} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ContactsSection({ companyId, contacts, canEdit }: { companyId: string; contacts: CompanyContactRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<CompanyContactRow | "new" | null>(null);
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900">Contacts</h2>
        {canEdit && (
          <Button size="xs" onClick={() => setEditing("new")}>
            + Add
          </Button>
        )}
      </div>
      {contacts.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No contacts yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 text-sm">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="font-medium text-gray-900">
                  {c.name}
                  {c.role && <span className="ml-2 text-xs font-normal text-gray-500">{c.role}</span>}
                </div>
                <div className="text-xs text-gray-600">
                  {[c.email, c.phone].filter(Boolean).join(" · ")}
                </div>
                {c.notes && <div className="mt-0.5 whitespace-pre-line text-xs text-gray-500">{c.notes}</div>}
              </div>
              {canEdit && (
                <Button variant="ghost" size="xs" onClick={() => setEditing(c)}>
                  Edit
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <ContactForm companyId={companyId} contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ContactForm({ companyId, contact, onClose }: { companyId: string; contact: CompanyContactRow | null; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState({
    name: contact?.name ?? "",
    role: contact?.role ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    notes: contact?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const base = `/api/erp/companies/${companyId}/contacts`;
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function send(method: "POST" | "PUT" | "DELETE") {
    setSaving(true);
    setError("");
    const res = await fetch(contact ? `${base}/${contact.id}` : base, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "DELETE" ? undefined : JSON.stringify(form),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!contact) return;
    const ok = await confirm({ message: `Delete ${contact.name} from this company?`, confirmLabel: "Delete", danger: true });
    if (ok) await send("DELETE");
  }

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="md">
      <h3 className="text-base font-semibold text-gray-900">{contact ? `Edit ${contact.name}` : "Add a contact"}</h3>
      <div className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass.default}>
            Name
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass.md} autoFocus />
          </label>
          <label className={labelClass.default}>
            Role
            <input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Accounts payable" className={inputClass.md} />
          </label>
          <label className={labelClass.default}>
            Email
            <input value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass.md} />
          </label>
          <label className={labelClass.default}>
            Phone
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass.md} />
          </label>
        </div>
        <label className={labelClass.default}>
          Notes
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputClass.md} />
        </label>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <div>
          {contact && (
            <Button variant="ghost" size="sm" onClick={remove} disabled={saving} className="text-red-600 hover:text-red-700">
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => send(contact ? "PUT" : "POST")} disabled={saving || !form.name.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

type LinkedRow = { id: string; label: string; sub: string | null };

/** Property managers and COI holders linked to this company. Their own pages are unchanged. */
export function LinksSection({
  companyId,
  canEdit,
  propertyManagers,
  coiHolders,
  pmOptions,
  coiOptions,
}: {
  companyId: string;
  canEdit: boolean;
  propertyManagers: LinkedRow[];
  coiHolders: LinkedRow[];
  pmOptions: SearchableSelectOption[];
  coiOptions: SearchableSelectOption[];
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Linked records
        <InfoTip text="Property manager links and COI holders that belong to this company. Linking doesn't change their own pages." />
      </h2>
      <LinkList
        title="Property managers"
        kind="propertyManager"
        companyId={companyId}
        canEdit={canEdit}
        rows={propertyManagers}
        options={pmOptions.filter((o) => !propertyManagers.some((r) => r.id === o.value))}
        href={(id) => `/erp/property-managers?open=${id}`}
      />
      <LinkList
        title="COI holders"
        kind="coiHolder"
        companyId={companyId}
        canEdit={canEdit}
        rows={coiHolders}
        options={coiOptions.filter((o) => !coiHolders.some((r) => r.id === o.value))}
        href={() => "/erp/insurance"}
      />
    </section>
  );
}

function LinkList({
  title,
  kind,
  companyId,
  canEdit,
  rows,
  options,
  href,
}: {
  title: string;
  kind: "propertyManager" | "coiHolder";
  companyId: string;
  canEdit: boolean;
  rows: LinkedRow[];
  options: SearchableSelectOption[];
  href: (id: string) => string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function setLink(targetId: string, linked: boolean) {
    if (!targetId) return;
    setBusy(true);
    const res = await fetch(`/api/erp/companies/${companyId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, targetId, linked }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Could not save.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-gray-500">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-gray-400">None linked.</p>
      ) : (
        <ul className="mt-1 divide-y divide-gray-100 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <Link href={href(r.id)} className="font-medium text-gray-900 hover:text-pink-600">
                  {r.label}
                </Link>
                {r.sub && <span className="ml-2 text-xs text-gray-500">{r.sub}</span>}
              </div>
              {canEdit && (
                <Button variant="ghost" size="xs" disabled={busy} onClick={() => setLink(r.id, false)}>
                  Unlink
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && options.length > 0 && (
        <SearchableSelect value="" onChange={(v) => void setLink(v, true)} options={options} allLabel={`Link a ${title.toLowerCase().replace(/s$/, "")}…`} className="mt-1" disabled={busy} />
      )}
    </div>
  );
}

/** Projects billed to this company. Post-construction jobs are added here;
 * janitorial ones come from the building they're at. */
export function ProjectsSection({
  companyId,
  projects,
  totalCount,
  viaBuildingCount,
  options,
}: {
  companyId: string;
  projects: { id: string; jobTitle: string; status: string }[];
  totalCount: number;
  viaBuildingCount: number;
  options: SearchableSelectOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function setClient(projectId: string, linked: boolean) {
    if (!projectId) return;
    setBusy(true);
    const res = await fetch(`/api/erp/projects/${projectId}/company`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientCompanyId: linked ? companyId : null }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Could not save.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Projects
        <InfoTip text="Post-construction jobs billed to this company. Add them here or from the project's Overview. Janitorial jobs bill whoever manages their building, counted below." />
      </h2>
      {options.length > 0 && (
        <SearchableSelect value="" onChange={(v) => void setClient(v, true)} options={options} allLabel="Add a post-construction project…" className="mt-2" disabled={busy} />
      )}
      {projects.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No projects added yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 text-sm">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
              <Link href={`/erp/projects/${p.id}`} className="min-w-0 truncate font-medium text-gray-900 hover:text-pink-600">
                {p.jobTitle}
              </Link>
              <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                {p.status}
                <Button variant="ghost" size="xs" disabled={busy} onClick={() => void setClient(p.id, false)}>
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {totalCount > projects.length && <p className="mt-1 text-xs text-gray-500">Showing the newest {projects.length} of {totalCount}.</p>}
      {viaBuildingCount > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          Plus {viaBuildingCount} job{viaBuildingCount === 1 ? "" : "s"} at their buildings.
        </p>
      )}
    </section>
  );
}


type LinkedLogin = { id: string; name: string; url: string | null; username: string | null; hasPassword: boolean };

/** How long a revealed password stays on screen, same as Company Info. */
const REVEAL_MS = 30_000;

/** Company Info logins this company's billing portal uses. Passwords come
 * from Company Info's logged reveal route; nothing is stored per company. */
export function PortalLoginsSection({
  companyId,
  canLink,
  logins,
  options,
}: {
  companyId: string;
  canLink: boolean;
  logins: LinkedLogin[];
  options: SearchableSelectOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  async function fetchPassword(id: string, action: "REVEAL" | "COPY"): Promise<string | null> {
    const res = await fetch(`/api/erp/company-info/logins/${id}/reveal`, {
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

  async function reveal(id: string) {
    clearTimeout(timers.current[id]);
    if (revealed[id] != null) {
      setRevealed(({ [id]: _, ...rest }) => rest);
      return;
    }
    const value = await fetchPassword(id, "REVEAL");
    if (value == null) return;
    setRevealed((r) => ({ ...r, [id]: value }));
    timers.current[id] = setTimeout(() => setRevealed(({ [id]: _, ...rest }) => rest), REVEAL_MS);
  }

  async function copy(text: string | null, what: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied.`);
    } catch {
      toast("Could not copy.");
    }
  }

  async function setLink(loginId: string, linked: boolean) {
    if (!loginId) return;
    setBusy(true);
    const res = await fetch(`/api/erp/companies/${companyId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "login", targetId: loginId, linked }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      toast(data.error ?? "Could not save.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
          Portal logins
          <InfoTip text="Logins saved on Company Info that we use for this company's billing portal. One login can serve several companies. Every Reveal and Copy is logged." />
        </h2>
        <Link href="/erp/company-info/logins" className="text-xs text-pink-600 hover:underline">
          Manage on Company Info
        </Link>
      </div>
      {logins.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No logins linked.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 text-sm">
          {logins.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="font-medium text-gray-900">
                  {l.url ? (
                    <a href={l.url} target="_blank" rel="noreferrer" className="hover:text-pink-600">
                      {l.name}
                    </a>
                  ) : (
                    l.name
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-gray-600">
                  {l.username && (
                    <button type="button" onClick={() => void copy(l.username, "Username")} className="hover:text-pink-600" title="Copy username">
                      {l.username}
                    </button>
                  )}
                  {l.hasPassword && <span className="font-mono">{revealed[l.id] ?? "••••••••"}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {l.hasPassword && (
                  <>
                    <Button variant="ghost" size="xs" onClick={() => void reveal(l.id)}>
                      {revealed[l.id] != null ? "Hide" : "Reveal"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={async () => {
                        const v = await fetchPassword(l.id, "COPY");
                        if (v != null) await copy(v, "Password");
                      }}
                    >
                      Copy
                    </Button>
                  </>
                )}
                {canLink && (
                  <Button variant="ghost" size="xs" disabled={busy} onClick={() => void setLink(l.id, false)}>
                    Unlink
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canLink && options.length > 0 && (
        <SearchableSelect value="" onChange={(v) => void setLink(v, true)} options={options} allLabel="Link a login from Company Info…" className="mt-2" disabled={busy} />
      )}
    </section>
  );
}
