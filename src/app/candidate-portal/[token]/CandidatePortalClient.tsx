"use client";

import { useState } from "react";
import { uploadCandidateFile } from "@/lib/firebaseStorage";

type PaperworkItem = { label: string; url: string };

type Props = {
  token: string;
  fullName: string;
  paperwork: PaperworkItem[];
};

type UploadState = "idle" | "uploading" | "done" | "error";

export function CandidatePortalClient({ token, fullName, paperwork: initial }: Props) {
  const [items, setItems] = useState<PaperworkItem[]>(initial);
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleFileChange(label: string, file: File) {
    setUploadState((s) => ({ ...s, [label]: "uploading" }));
    setErrors((e) => ({ ...e, [label]: "" }));
    setProgress((p) => ({ ...p, [label]: 0 }));

    try {
      const url = await uploadCandidateFile(token, label, file, (pct) => {
        setProgress((p) => ({ ...p, [label]: pct }));
      });

      const res = await fetch(`/api/candidate-portal/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, url }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Save failed");
      }

      setItems((prev) => prev.map((p) => (p.label === label ? { ...p, url } : p)));
      setUploadState((s) => ({ ...s, [label]: "done" }));
    } catch (err) {
      setUploadState((s) => ({ ...s, [label]: "error" }));
      setErrors((e) => ({ ...e, [label]: err instanceof Error ? err.message : "Upload failed" }));
    }
  }

  const allDone = items.every((p) => p.url);

  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <svg className="mx-auto mb-4 h-10 w-10 text-[#E73C6E]" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">Upload your documents</h1>
          <p className="mt-2 text-sm text-gray-500">Hi {fullName} — please upload each required document below.</p>
        </div>

        {allDone && (
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">All documents uploaded. You&apos;re all set!</p>
          </div>
        )}

        <div className="space-y-4">
          {items.map((item) => {
            const state = uploadState[item.label] ?? (item.url ? "done" : "idle");
            const pct = progress[item.label] ?? 0;
            const err = errors[item.label];

            return (
              <div
                key={item.label}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    {state === "done" && (
                      <p className="mt-1 text-xs text-emerald-600 font-medium">Uploaded</p>
                    )}
                    {state === "uploading" && (
                      <p className="mt-1 text-xs text-blue-600">{pct}%…</p>
                    )}
                    {err && (
                      <p className="mt-1 text-xs text-red-500">{err}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {state === "done" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        ✓ Done
                      </span>
                    ) : (
                      <label className="cursor-pointer rounded-md bg-[#E73C6E] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity">
                        {state === "uploading" ? "Uploading…" : "Choose file"}
                        <input
                          type="file"
                          className="sr-only"
                          disabled={state === "uploading"}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleFileChange(item.label, file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
                {state === "uploading" && (
                  <div className="mt-3 h-1.5 w-full rounded-full bg-gray-200">
                    <div
                      className="h-1.5 rounded-full bg-[#E73C6E] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          Having trouble? Reply to the email we sent you.
        </p>
      </div>
    </div>
  );
}
