"use client";

import { useMemo, useState } from "react";
import { CollapsiblePanel } from "@/app/erp/components/CollapsiblePanel";

type DocumentRow = {
  id: string;
  documentType: string;
  title: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  fileUrl: string | null;
  notes: string | null;
};

type BackgroundCheckStatus = "PASSED" | "FAILED" | "PENDING" | "NOT_DONE";

const BG_OPTIONS: { value: BackgroundCheckStatus; label: string; cls: string }[] = [
  { value: "NOT_DONE",  label: "Not done",  cls: "border-gray-300 bg-gray-50 text-gray-600" },
  { value: "PENDING",   label: "Pending",   cls: "border-yellow-300 bg-yellow-50 text-yellow-700" },
  { value: "PASSED",    label: "Passed",    cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { value: "FAILED",    label: "Failed",    cls: "border-red-300 bg-red-50 text-red-700" },
];

type Props = {
  employeeId: string;
  initialDocuments: DocumentRow[];
  initialRequiredDocuments: string[];
  initialBackgroundCheckStatus: BackgroundCheckStatus;
};

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

export function EmployeeDocumentsSection({ employeeId, initialDocuments, initialRequiredDocuments, initialBackgroundCheckStatus }: Props) {
  const [docs, setDocs] = useState<DocumentRow[]>(initialDocuments);
  const [required, setRequired] = useState<string[]>(initialRequiredDocuments);
  const [bgStatus, setBgStatus] = useState<BackgroundCheckStatus>(initialBackgroundCheckStatus);
  const [bgSaving, setBgSaving] = useState(false);
  const [newReq, setNewReq] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingReq, setSavingReq] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqOk, setReqOk] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const presentTypes = useMemo(() => new Set(docs.map((d) => d.documentType.toLowerCase())), [docs]);

  const presentCount = useMemo(
    () => required.filter((r) => presentTypes.has(r.toLowerCase())).length,
    [required, presentTypes],
  );

  async function saveBgStatus(next: BackgroundCheckStatus) {
    setBgSaving(true);
    try {
      await fetch(`/api/erp/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backgroundCheckStatus: next }),
      });
    } finally {
      setBgSaving(false);
    }
  }

  async function persistRequired(next: string[]) {
    setSavingReq(true);
    setReqError("");
    setReqOk(false);
    try {
      const res = await fetch(`/api/erp/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requiredDocuments: next }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setReqError(data.error ?? "Failed to save");
        return;
      }
      setReqOk(true);
      setTimeout(() => setReqOk(false), 2000);
    } catch {
      setReqError("Network error");
    } finally {
      setSavingReq(false);
    }
  }

  function addRequired() {
    const trimmed = newReq.trim();
    if (!trimmed) return;
    if (required.map((r) => r.toLowerCase()).includes(trimmed.toLowerCase())) return;
    const next = [...required, trimmed];
    setRequired(next);
    setNewReq("");
    void persistRequired(next);
  }

  function removeRequired(i: number) {
    const next = required.filter((_, idx) => idx !== i);
    setRequired(next);
    void persistRequired(next);
  }

  function startEdit(i: number) {
    setEditingIndex(i);
    setEditValue(required[i]);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditValue("");
  }

  function saveEdit(i: number) {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    const duplicate = required.some((r, idx) => idx !== i && r.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) return;
    const next = required.map((r, idx) => (idx === i ? trimmed : r));
    setRequired(next);
    setEditingIndex(null);
    setEditValue("");
    void persistRequired(next);
  }

  const sortedDocs = useMemo(
    () =>
      [...docs].sort((a, b) => {
        if (!a.expiresAt && !b.expiresAt) return a.documentType.localeCompare(b.documentType);
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return a.expiresAt.localeCompare(b.expiresAt);
      }),
    [docs],
  );

  async function addDoc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch(`/api/erp/employees/${employeeId}/documents`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as DocumentRow & { error?: string };
      if (!res.ok) {
        setAddError(data.error ?? "Failed to add document");
        setAddLoading(false);
        return;
      }
      setDocs((prev) => [data, ...prev]);
      e.currentTarget.reset();
      setSelectedFileName(null);
    } catch {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
  }

  async function deleteDoc(doc: DocumentRow) {
    const res = await fetch(`/api/erp/employees/${employeeId}/documents/${doc.id}`, { method: "DELETE" });
    if (!res.ok) return;
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  }

  return (
    <div className="space-y-4">
      <CollapsiblePanel title="Required Documents">
        <p className="text-xs text-gray-500">
          Define which document types this employee must have on file. Compliance is met when all are present.
        </p>

        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Background check</p>
          <div className="flex flex-wrap gap-2">
            {BG_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={bgSaving}
                onClick={() => {
                  setBgStatus(opt.value);
                  void saveBgStatus(opt.value);
                }}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition-opacity",
                  bgStatus === opt.value ? opt.cls + " opacity-100 ring-2 ring-offset-1 ring-current" : "border-gray-200 bg-white text-gray-400 hover:border-gray-300",
                  bgSaving ? "opacity-50 cursor-not-allowed" : "",
                ].join(" ")}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {required.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">
              {presentCount} / {required.length} on file
            </p>
            <ul className="space-y-1.5">
              {required.map((req, i) => {
                const present = presentTypes.has(req.toLowerCase());
                if (editingIndex === i) {
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <span className={present ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
                        {present ? "✓" : "✗"}
                      </span>
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveEdit(i); }
                          if (e.key === "Escape") cancelEdit();
                        }}
                        className="flex-1 rounded-md border border-pink-400 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-pink-500"
                      />
                      <button type="button" onClick={() => saveEdit(i)} disabled={savingReq} className="text-xs text-emerald-600 hover:text-emerald-800 disabled:opacity-40">Save</button>
                      <button type="button" onClick={cancelEdit} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </li>
                  );
                }
                return (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={present ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
                        {present ? "✓" : "✗"}
                      </span>
                      <span className="text-gray-800">{req}</span>
                    </span>
                    <span className="flex gap-3">
                      <button type="button" onClick={() => startEdit(i)} disabled={savingReq} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40">Edit</button>
                      <button type="button" onClick={() => removeRequired(i)} disabled={savingReq} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40">Delete</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newReq}
            onChange={(e) => setNewReq(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRequired();
              }
            }}
            placeholder="e.g. I-9, OSHA card, Driver&apos;s license"
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
          <button
            type="button"
            onClick={addRequired}
            disabled={savingReq}
            className="rounded-md bg-[#E73C6E] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {reqError ? <p className="text-xs text-red-500">{reqError}</p> : null}
        {reqOk ? <p className="text-xs text-emerald-600">Saved.</p> : null}
      </CollapsiblePanel>

      <CollapsiblePanel title="Documents on File">
        <p className="text-xs text-gray-500">Upload and manage this employee&apos;s documents.</p>

        <form onSubmit={addDoc} className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor="documentType">
                Document type
              </label>
              <input id="documentType" name="documentType" required placeholder="e.g. OSHA card, I-9" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="title">
                Title (optional)
              </label>
              <input id="title" name="title" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>
                File (optional)
              </label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:border-pink-400 transition-colors">
                <span className="rounded bg-[#E73C6E] px-2 py-0.5 text-xs font-medium text-white">
                  Choose file
                </span>
                <span className="truncate text-gray-500">
                  {selectedFileName ?? "No file chosen"}
                </span>
                <input
                  type="file"
                  name="file"
                  className="sr-only"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name ?? null)}
                />
              </label>
              <p className="mt-1 text-xs text-gray-400">PDF, JPEG, PNG, or WEBP · max 4 MB</p>
            </div>
            <div>
              <label className={labelCls} htmlFor="issuedAt">
                Issued date
              </label>
              <input id="issuedAt" name="issuedAt" type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="expiresAt">
                Expiration date
              </label>
              <input id="expiresAt" name="expiresAt" type="date" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="notes">
              Notes
            </label>
            <textarea id="notes" name="notes" rows={2} className={inputCls} />
          </div>
          {addError ? <p className="text-xs text-red-500">{addError}</p> : null}
          <button
            type="submit"
            disabled={addLoading}
            className="rounded-md bg-[#E73C6E] px-3 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {addLoading ? "Adding…" : "Add document"}
          </button>
        </form>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-100 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Issued</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    No documents yet.
                  </td>
                </tr>
              ) : (
                sortedDocs.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 text-gray-800">{d.documentType}</td>
                    <td className="px-3 py-2 text-gray-700">{d.title ?? "—"}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {d.issuedAt ? new Date(d.issuedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {d.fileUrl ? (
                        <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-pink-600 hover:underline">
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void deleteDoc(d)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CollapsiblePanel>
    </div>
  );
}
