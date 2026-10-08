"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import { COMPANY_DOC_KINDS, type CompanyDocKind, type CompanyDocumentRow } from "@/lib/erp/companyInfo";

export function docHref(doc: CompanyDocumentRow): string {
  return doc.linkUrl ?? `/api/erp/company-info/documents/${doc.id}`;
}

/** The file name or "Drive link", opening in a new tab, with a small remove button. */
export function DocLink({ doc }: { doc: CompanyDocumentRow }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  async function remove() {
    const ok = await confirm({ title: `Remove ${doc.label}?`, message: "The file or link is removed from the ERP.", confirmLabel: "Remove" });
    if (!ok) return;
    const res = await fetch(`/api/erp/company-info/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Could not remove it.");
      return;
    }
    toast(`${doc.label} removed.`);
    router.refresh();
  }

  const added = new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <span className="group/doc inline-flex min-w-0 items-center gap-1.5">
      <a
        href={docHref(doc)}
        target="_blank"
        rel="noopener noreferrer"
        title={`Added ${added}${doc.uploadedByEmail ? ` by ${doc.uploadedByEmail}` : ""}`}
        className="truncate text-pink-600 hover:underline"
      >
        {doc.linkUrl ? "Drive link" : doc.filename}
      </a>
      <button
        type="button"
        onClick={remove}
        aria-label={`Remove ${doc.label}`}
        className="text-gray-300 hover:text-red-600 sm:opacity-0 sm:group-hover/doc:opacity-100 sm:focus:opacity-100"
      >
        ×
      </button>
    </span>
  );
}

/** Upload a file or paste a Drive link. P&L and balance sheet take a year
 * and replace that year's old one; Other takes a name. */
export function AddDocumentModal({ kind, year, onClose }: { kind: CompanyDocKind; year?: number; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const kindLabel = COMPANY_DOC_KINDS.find((k) => k.id === kind)!.label;
  const title = kind === "OTHER" ? "Add a document" : `${kindLabel} for ${year}`;

  async function save() {
    setSaving(true);
    setError("");
    const form = new FormData();
    form.set("kind", kind);
    if (year != null) form.set("year", String(year));
    if (kind === "OTHER") form.set("label", label);
    if (mode === "file" && file) form.set("file", file);
    if (mode === "link") form.set("link", link);
    const res = await fetch("/api/erp/company-info/documents", { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? (res.status === 413 ? "File too large (max 4 MB). Paste a Drive link instead." : "Could not save."));
      return;
    }
    toast(`${kind === "OTHER" ? label.trim() : kindLabel} added.`);
    onClose();
    router.refresh();
  }

  const ready = (kind !== "OTHER" || label.trim()) && (mode === "file" ? !!file : !!link.trim());

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="md">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <div className="mt-4 space-y-3">
        {kind === "OTHER" && (
          <label className={labelClass.default}>
            Name
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. W9" className={inputClass.md} autoFocus />
          </label>
        )}
        <div className="flex gap-1 rounded-md bg-gray-100 p-0.5 text-xs font-medium">
          {(["file", "link"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded px-3 py-1.5 ${mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              {m === "file" ? "Upload a file" : "Paste a link"}
            </button>
          ))}
        </div>
        {mode === "file" ? (
          <label className={labelClass.default}>
            File (PDF, image, Excel, Word, or CSV, max 4 MB)
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.csv,.docx,.doc"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-pink-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-pink-700 hover:file:bg-pink-100"
            />
          </label>
        ) : (
          <label className={labelClass.default}>
            Google Drive or other link
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" className={inputClass.md} />
          </label>
        )}
        {kind !== "OTHER" && <p className="text-[11px] text-gray-400">Replaces the current {kindLabel.toLowerCase()} for {year}, if there is one.</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving || !ready}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}
