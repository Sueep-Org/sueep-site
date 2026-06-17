"use client";

import { useEffect, useRef, useState } from "react";

export type AttachmentMeta = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkOrderAttachmentsSection({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const base = `/api/erp/projects/${projectId}/work-order-attachments`;

  useEffect(() => {
    fetch(base)
      .then((r) => r.json())
      .then((data: AttachmentMeta[]) => {
        setAttachments(data);
        setLoaded(true);
        if (data.length > 0) setOpen(true);
      })
      .catch(() => setLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(base, { method: "POST", body: fd });
      const data = await res.json() as AttachmentMeta & { error?: string };
      if (!res.ok) { setUploadError(data.error ?? "Upload failed"); return; }
      setAttachments((prev) => [...prev, data]);
      setOpen(true);
    } catch {
      setUploadError("Network error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this attachment?")) return;
    setDeleting(id);
    try {
      await fetch(`${base}/${id}`, { method: "DELETE" });
      setAttachments((prev) => {
        const next = prev.filter((a) => a.id !== id);
        if (next.length === 0) setOpen(false);
        return next;
      });
    } finally {
      setDeleting(null);
    }
  }

  if (!loaded) return null;

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
          Attachments
          {attachments.length > 0 && (
            <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
              {attachments.length}
            </span>
          )}
        </button>

        <label className={`flex cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${uploading ? "cursor-not-allowed opacity-50 text-gray-400" : "text-pink-600 hover:bg-pink-50"}`}>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          {uploading ? "Uploading…" : "Attach file"}
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept=".pdf,image/*"
            disabled={uploading}
            onChange={handleUpload}
          />
        </label>
      </div>

      {uploadError && (
        <p className="mt-2 text-xs text-red-500">{uploadError}</p>
      )}

      {open && attachments.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-200 rounded-md border border-gray-200 bg-white overflow-hidden">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 shrink-0 text-gray-400">
                <path fillRule="evenodd" d="M3 3a2 2 0 0 1 2-2h5.879A2 2 0 0 1 12.3 1.586l1.72 1.72A2 2 0 0 1 14.6 4.72V13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3Zm2 1a1 1 0 0 0 0 2h6a1 1 0 1 0 0-2H5Zm0 4a1 1 0 0 0 0 2h6a1 1 0 1 0 0-2H5Z" clipRule="evenodd" />
              </svg>
              <a
                href={`${base}/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 truncate text-sm text-gray-700 hover:text-pink-600 hover:underline"
              >
                {a.filename}
              </a>
              <span className="shrink-0 text-xs text-gray-400">{formatBytes(a.size)}</span>
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                disabled={deleting === a.id}
                className="shrink-0 text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors"
                aria-label="Remove attachment"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
