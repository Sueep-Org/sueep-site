"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { InfoTip } from "@/app/erp/components/ui";

export type ResumeFile = { id: string; filename: string; size: number; createdAt: string };

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeUploader({ candidateId, files }: { candidateId: string; files: ResumeFile[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/erp/candidates/${candidateId}/resume`, { method: "POST", body });
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `Upload failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  async function remove(f: ResumeFile) {
    if (!confirm(`Delete ${f.filename}?`)) return;
    setError(null);
    const res = await fetch(`/api/erp/candidates/${candidateId}/documents/${f.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(`Delete failed (${res.status})`);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          Resume
          <InfoTip text="PDF, Word or image, up to 4 MB. Moves to their employee or contractor profile when hired." />
        </h2>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload resume"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {files.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">No resume yet.</div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <a
                href={`/api/erp/candidates/${candidateId}/documents/${f.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate font-medium text-gray-800 hover:underline"
              >
                {f.filename}
              </a>
              <span className="flex shrink-0 items-center gap-3 text-xs text-gray-500">
                {formatSize(f.size)} · {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                <button type="button" onClick={() => void remove(f)} className="font-medium text-red-500 hover:underline">
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
