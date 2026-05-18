"use client";

import { useState } from "react";

type PaperworkItem = { label: string; url: string };

type Props = {
  token: string;
  fullName: string;
  paperwork: PaperworkItem[];
  bankAccountRequired: boolean;
  initialBankAccountType: string | null;
  initialBankAccountNumber: string | null;
  initialBankRoutingNumber: string | null;
};

type UploadState = "idle" | "uploading" | "done" | "error";
type BankSaveState = "idle" | "saving" | "saved" | "error";

export function CandidatePortalClient({
  token,
  fullName,
  paperwork: initial,
  bankAccountRequired,
  initialBankAccountType,
  initialBankAccountNumber,
  initialBankRoutingNumber,
}: Props) {
  const [items, setItems] = useState<PaperworkItem[]>(initial);
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [bankAccountType, setBankAccountType] = useState(initialBankAccountType ?? "checking");
  const [bankAccountNumber, setBankAccountNumber] = useState(initialBankAccountNumber ?? "");
  const [bankRoutingNumber, setBankRoutingNumber] = useState(initialBankRoutingNumber ?? "");
  const [bankSaveState, setBankSaveState] = useState<BankSaveState>(
    initialBankAccountNumber ? "saved" : "idle"
  );
  const [bankError, setBankError] = useState("");

  async function handleFileChange(label: string, file: File) {
    setUploadState((s) => ({ ...s, [label]: "uploading" }));
    setErrors((e) => ({ ...e, [label]: "" }));

    const fd = new FormData();
    fd.append("label", label);
    fd.append("file", file);

    try {
      const res = await fetch(`/api/candidate-portal/${token}/upload`, {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");

      setItems((prev) => prev.map((p) => (p.label === label ? { ...p, url: "uploaded" } : p)));
      setUploadState((s) => ({ ...s, [label]: "done" }));
    } catch (err) {
      setUploadState((s) => ({ ...s, [label]: "error" }));
      setErrors((e) => ({ ...e, [label]: err instanceof Error ? err.message : "Upload failed" }));
    }
  }

  async function saveBankAccount() {
    if (!bankAccountNumber.trim() || !bankRoutingNumber.trim()) {
      setBankError("Account number and routing number are required.");
      return;
    }
    setBankError("");
    setBankSaveState("saving");
    try {
      const res = await fetch(`/api/candidate-portal/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bankAccountType, bankAccountNumber, bankRoutingNumber }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setBankSaveState("saved");
    } catch (err) {
      setBankSaveState("error");
      setBankError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const filesDone = items.every((p) => p.url);
  const bankDone = !bankAccountRequired || bankSaveState === "saved";
  const allDone = filesDone && bankDone;

  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <svg className="mx-auto mb-4 h-10 w-10 text-[#E73C6E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">Upload your documents</h1>
          <p className="mt-2 text-sm text-gray-500">
            Hi {fullName} — please upload each required document below.
          </p>
          <p className="mt-1 text-xs text-gray-400">PDF, JPEG, or PNG · max 4 MB each</p>
        </div>

        {allDone && (
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">
              All documents uploaded. You&apos;re all set!
            </p>
          </div>
        )}

        <div className="space-y-4">
          {items.map((item) => {
            const state = uploadState[item.label] ?? (item.url ? "done" : "idle");
            const err = errors[item.label];

            return (
              <div key={item.label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    {state === "done" && (
                      <p className="mt-1 text-xs text-emerald-600 font-medium">Uploaded</p>
                    )}
                    {state === "uploading" && (
                      <p className="mt-1 text-xs text-blue-600">Uploading…</p>
                    )}
                    {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
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
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
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
              </div>
            );
          })}

          {bankAccountRequired && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">Bank Account Info</p>
                {bankSaveState === "saved" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    ✓ Saved
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Account type</label>
                <select
                  value={bankAccountType}
                  onChange={(e) => setBankAccountType(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
                >
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Account number</label>
                <input
                  type="text"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  placeholder="Enter account number"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Routing number</label>
                <input
                  type="text"
                  value={bankRoutingNumber}
                  onChange={(e) => setBankRoutingNumber(e.target.value)}
                  placeholder="Enter routing number"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
                />
              </div>

              {bankError && <p className="text-xs text-red-500">{bankError}</p>}

              <button
                type="button"
                onClick={() => void saveBankAccount()}
                disabled={bankSaveState === "saving"}
                className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {bankSaveState === "saving" ? "Saving…" : bankSaveState === "saved" ? "Update bank info" : "Save bank info"}
              </button>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-gray-400">
          Having trouble? Reply to the email we sent you.
        </p>
      </div>
    </div>
  );
}
