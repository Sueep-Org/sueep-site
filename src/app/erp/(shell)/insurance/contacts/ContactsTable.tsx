"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import type { ContactRow } from "../types";

/** Our broker, agent, and carrier contacts. */
export function ContactsTable({ contacts }: { contacts: ContactRow[] }) {
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          + Add contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          No contacts yet. Add our broker first.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Handles</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map((c) => (
                <tr key={c.id} onClick={() => setEditing(c)} className="cursor-pointer align-top hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-medium text-gray-900">
                      {c.name}
                      {c.notes && <InfoTip text={c.notes} />}
                    </div>
                    {c.company && <div className="text-xs text-gray-500">{c.company}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{c.role ?? ""}</td>
                  <td className="px-3 py-2">
                    {c.email && (
                      <a href={`mailto:${c.email}`} onClick={(e) => e.stopPropagation()} className="text-pink-600 hover:underline">
                        {c.email}
                      </a>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {c.phone && (
                      <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="text-gray-900 hover:underline">
                        {c.phone}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <ContactForm contact={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ContactForm({ contact, onClose }: { contact: ContactRow | null; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState({
    name: contact?.name ?? "",
    company: contact?.company ?? "",
    role: contact?.role ?? "",
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    notes: contact?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(contact ? `/api/erp/insurance/contacts/${contact.id}` : "/api/erp/insurance/contacts", {
      method: contact ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    toast(contact ? `${form.name} saved.` : `${form.name} added.`);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!contact) return;
    const ok = await confirm({ title: `Delete ${contact.name}?`, message: "This removes the contact. It can't be undone.", confirmLabel: "Delete" });
    if (!ok) return;
    const res = await fetch(`/api/erp/insurance/contacts/${contact.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete.");
      return;
    }
    toast(`${contact.name} deleted.`);
    onClose();
    router.refresh();
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
            Company
            <input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Agency or carrier" className={inputClass.md} />
          </label>
        </div>
        <label className={labelClass.default}>
          Handles
          <input value={form.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Broker, all policies" className={inputClass.md} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass.default}>
            Email
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass.md} />
          </label>
          <label className={labelClass.default}>
            Phone
            <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass.md} />
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
