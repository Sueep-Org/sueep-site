"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProjectEmailComposer } from "./ProjectEmailComposer";
import type { EmailQuota } from "@/lib/erp/emailQuota";
import { ProjectEmailHistory, type ProjectEmailRow } from "./ProjectEmailHistory";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";

export type CommunicationsContact = {
  id: string;
  /** CONTRACTOR rows come from the project's Contractors tab, HUBSPOT rows
   * from the deal's contacts, MANUAL rows were added here. Only MANUAL rows
   * can be edited or removed on this tab. */
  kind: "CONTRACTOR" | "HUBSPOT" | "MANUAL";
  fullName: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};

const KIND_STYLE: Record<CommunicationsContact["kind"], { label: string; cls: string }> = {
  CONTRACTOR: { label: "Contractor", cls: "bg-amber-50 text-amber-700" },
  HUBSPOT: { label: "HubSpot", cls: "bg-orange-50 text-orange-700" },
  MANUAL: { label: "Added here", cls: "bg-gray-100 text-gray-600" },
};

type Draft = { id: string | null; fullName: string; company: string; role: string; email: string; phone: string };
const EMPTY_DRAFT: Draft = { id: null, fullName: "", company: "", role: "", email: "", phone: "" };

export function ProjectCommunicationsSection({
  projectId,
  canManage,
  canSync,
  senderEmail,
  quota,
  emails,
  historyLimit,
  contractors,
  initialContacts,
}: {
  projectId: string;
  /** Add, edit, remove and sync. Everyone else gets a read-only list. */
  canManage: boolean;
  /** The project is linked to a HubSpot deal. */
  canSync: boolean;
  /** The signed-in user, copied on every email they send from here. */
  senderEmail: string;
  /** Today's count against the email provider's daily limit. */
  quota: EmailQuota;
  /** Emails about this project, newest first, at most historyLimit of them. */
  emails: ProjectEmailRow[];
  historyLimit: number;
  contractors: CommunicationsContact[];
  initialContacts: CommunicationsContact[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const left = Math.max(0, quota.cutoff - quota.used);
  const resetTime = new Date(quota.resetsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const [contacts, setContacts] = useState(initialContacts);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [composing, setComposing] = useState(false);

  const rows = [...contacts, ...contractors];
  const emailable = rows.flatMap((c) => (c.email ? [{ name: c.fullName, email: c.email, from: KIND_STYLE[c.kind].label }] : []));

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError("");
    if (!draft.fullName.trim()) {
      setError("Enter a name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/contacts${draft.id ? `/${draft.id}` : ""}`, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: draft.fullName, company: draft.company, role: draft.role, email: draft.email, phone: draft.phone }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error === "fullName is required" ? "Enter a name" : data?.error || "Could not save");
        return;
      }
      const saved: CommunicationsContact = { ...data, kind: "MANUAL" };
      setContacts((prev) => (draft.id ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved]));
      setDraft(null);
      toast(draft.id ? "Contact updated." : "Contact added.");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function onRemove(c: CommunicationsContact) {
    if (!(await confirm({ title: "Remove contact?", message: `${c.fullName} will be taken off this project's contact list.`, confirmLabel: "Remove" }))) return;
    const res = await fetch(`/api/erp/projects/${projectId}/contacts/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Could not remove the contact.", "error");
      return;
    }
    setContacts((prev) => prev.filter((x) => x.id !== c.id));
    toast("Contact removed.");
  }

  async function onSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/contacts/sync`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "Could not sync from HubSpot.", "error");
        return;
      }
      setContacts((data.contacts as (Omit<CommunicationsContact, "kind"> & { source: string })[]).map((c) => ({ ...c, kind: c.source === "HUBSPOT" ? "HUBSPOT" : "MANUAL" })));
      toast("Contacts synced from HubSpot.");
    } catch {
      toast("Could not sync from HubSpot.", "error");
    } finally {
      setSyncing(false);
    }
  }

  const barColor = left === 0 ? "bg-red-500" : quota.used >= quota.cutoff - 20 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-4">
      {canManage && <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-gray-900">
            Emails today: {quota.used} of {quota.limit}
            <InfoTip text={`Everything the ERP and website sent today, across all projects. Each To and CC address counts as one. Emails written here pause at ${quota.cutoff} so the automatic ones later in the day still go out. Resets at ${resetTime}.`} />
          </span>
          <span className={left === 0 ? "font-medium text-red-700" : "text-gray-600"}>
            {left === 0 ? `Project emails paused until ${resetTime}` : `${left} left for project emails`}
          </span>
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-gray-200">
          <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} />
          {/* Where project emails stop */}
          <div className="absolute -top-0.5 h-3 w-0.5 bg-gray-500" style={{ left: `${(quota.cutoff / quota.limit) * 100}%` }} />
        </div>
      </div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Contacts
          <InfoTip text="Everyone tied to this project: contractors from the Contractors tab, client contacts from the HubSpot deal, and anyone added here. Contractors are edited on their profile and HubSpot contacts in HubSpot." />
        </h2>
        {canManage && (
          <div className="flex gap-2">
            {canSync && (
              <Button variant="secondary" size="sm" onClick={onSync} disabled={syncing}>
                {syncing ? "Syncing..." : "Sync from HubSpot"}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => { setError(""); setDraft(EMPTY_DRAFT); }}>
              Add contact
            </Button>
            <Button size="sm" onClick={() => setComposing(true)} disabled={left === 0} title={left === 0 ? `Paused until ${resetTime}` : undefined}>
              Write email
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No contacts on this project yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Name</th>
                <th className="py-2 pr-2 font-medium">Company / role</th>
                <th className="py-2 pr-2 font-medium">Email</th>
                <th className="py-2 pr-2 font-medium">Phone</th>
                <th className="py-2 pr-2 font-medium">From</th>
                {canManage && <th className="py-2 font-medium" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((c) => (
                <tr key={`${c.kind}:${c.id}`}>
                  <td className="py-2 pr-2 font-medium text-gray-900">
                    {c.kind === "CONTRACTOR" ? (
                      <Link href={`/erp/contractors/${c.id}`} className="hover:text-pink-600 hover:underline">{c.fullName}</Link>
                    ) : (
                      c.fullName
                    )}
                    {c.isPrimary && <span className="ml-2 rounded bg-pink-50 px-1.5 py-0.5 text-[11px] font-medium text-pink-700">Primary</span>}
                  </td>
                  <td className="py-2 pr-2 text-gray-600">{[c.company, c.role].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="py-2 pr-2">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-pink-600 hover:underline">{c.email}</a>
                    ) : (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">No email</span>
                    )}
                  </td>
                  <td className="py-2 pr-2 text-gray-600">{c.phone || "-"}</td>
                  <td className="py-2 pr-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${KIND_STYLE[c.kind].cls}`}>{KIND_STYLE[c.kind].label}</span>
                  </td>
                  {canManage && (
                    <td className="py-2 text-right whitespace-nowrap">
                      {c.kind === "MANUAL" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setError("");
                              setDraft({ id: c.id, fullName: c.fullName, company: c.company ?? "", role: c.role ?? "", email: c.email ?? "", phone: c.phone ?? "" });
                            }}
                          >
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="ml-3 text-red-600 hover:text-red-700" onClick={() => onRemove(c)}>
                            Remove
                          </Button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProjectEmailHistory projectId={projectId} emails={emails} limit={historyLimit} />

      {composing && (
        <ProjectEmailComposer
          projectId={projectId}
          people={emailable}
          senderEmail={senderEmail}
          left={left}
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            toast("Email sent. A copy is in the Email Log.");
            router.refresh();
          }}
        />
      )}

      <Modal open={draft !== null} onClose={() => setDraft(null)} dismissible={false} size="md">
        {draft && (
          <form onSubmit={onSave}>
            <h2 className="text-base font-semibold text-gray-900">{draft.id ? "Edit contact" : "Add contact"}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass.default} htmlFor="pc-name">Name</label>
                <input id="pc-name" className={inputClass.md} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} autoFocus />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="pc-company">Company</label>
                <input id="pc-company" className={inputClass.md} value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="pc-role">Role</label>
                <input id="pc-role" className={inputClass.md} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="pc-email">Email</label>
                <input id="pc-email" type="email" className={inputClass.md} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="pc-phone">Phone</label>
                <input id="pc-phone" className={inputClass.md} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
