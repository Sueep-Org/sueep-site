"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { DEFAULT_SIGNER } from "@/lib/erp/offerLetterStarters";

/** The signer's signature image, stamped on offer letters when they're sent. */
export function SignatureCard({ saved, canEdit }: { saved: { name: string; updatedAt: string; updatedBy: string | null } | null; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(saved?.name ?? DEFAULT_SIGNER.name);
  const [busy, setBusy] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast("Pick an image", "error");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", name);
    setBusy(true);
    const res = await fetch("/api/erp/offer-templates/signature", { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) return toast(data?.error || "Could not save", "error");
    setEditing(false);
    toast("Signature saved.");
    router.refresh();
  }

  async function remove() {
    if (!(await confirm({ message: "Remove the saved signature? Letters sent after this won't have it." }))) return;
    const res = await fetch("/api/erp/offer-templates/signature", { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return toast("Could not remove", "error");
    toast("Signature removed.");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            Signature
            <InfoTip text="Stamped above the signer's line when a letter is sent. Only used on templates signed by this same name. Use a PNG with a clear background." />
          </h2>
          {saved ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/erp/offer-templates/signature?v=${encodeURIComponent(saved.updatedAt)}`} alt={`${saved.name} signature`} className="h-10 w-auto rounded border border-gray-100 bg-white px-2" />
              <span className="text-sm text-gray-700">{saved.name}</span>
            </>
          ) : (
            <span className="text-sm text-gray-400">None saved. Letters go out with a blank line.</span>
          )}
        </div>
        {canEdit && !editing ? (
          <div className="flex items-center gap-2">
            {saved ? <Button variant="ghost" size="xs" onClick={remove}>Remove</Button> : null}
            <Button variant="secondary" size="xs" onClick={() => setEditing(true)}>{saved ? "Replace" : "Add signature"}</Button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <form onSubmit={upload} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label className={labelClass.default} htmlFor="sig-name">Signer name</label>
            <input id="sig-name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass.md} />
          </div>
          <div>
            <label className={labelClass.default} htmlFor="sig-file">Image (PNG or JPG)</label>
            <input id="sig-file" ref={fileRef} type="file" accept="image/png,image/jpeg" required className="mt-1 block w-full text-sm text-gray-700" />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
