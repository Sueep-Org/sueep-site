"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, inputClass, labelClass, useToast } from "@/app/erp/components/ui";

async function postTemplates(body: Record<string, unknown>) {
  const res = await fetch("/api/erp/offer-templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = (await res?.json().catch(() => ({}))) as { id?: string; error?: string } | undefined;
  return { ok: !!res?.ok, id: data?.id, error: data?.error };
}

export function AddStartersButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const r = await postTemplates({ starters: true });
    setBusy(false);
    if (!r.ok) return toast(r.error || "Could not add templates", "error");
    router.refresh();
  }
  return (
    <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
      {busy ? "Adding…" : "Add starter templates"}
    </Button>
  );
}

export function NewTemplateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const r = await postTemplates({ name });
    setSaving(false);
    if (!r.ok || !r.id) return setError(r.error || "Could not create");
    router.push(`/erp/candidates/offer-templates/${r.id}`);
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>New template</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm">
        <form onSubmit={onSubmit} className="space-y-3">
          <h2 className="text-base font-semibold text-gray-900">New template</h2>
          <div>
            <label className={labelClass.default} htmlFor="tpl-name">Name *</label>
            <input id="tpl-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales with commission" className={inputClass.md} />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DuplicateTemplateButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const r = await postTemplates({ duplicateOf: id });
    setBusy(false);
    if (!r.ok || !r.id) return toast(r.error || "Could not duplicate", "error");
    router.push(`/erp/candidates/offer-templates/${r.id}`);
  }
  return (
    <Button variant="ghost" size="xs" onClick={run} disabled={busy}>
      {busy ? "Copying…" : "Duplicate"}
    </Button>
  );
}
