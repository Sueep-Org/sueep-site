"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PaperworkItem = { label: string; url: string };

type Props = {
  id: string;
  fullName: string;
  status: string;
  paperwork: PaperworkItem[];
};

export function FinishOnboardingPanel({ id, fullName, status, paperwork }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingEmployeeId, setExistingEmployeeId] = useState<string | null>(null);

  const isOnboarding = status === "ONBOARDING";
  const pendingDocs = paperwork.filter((p) => !p.url);

  async function finish() {
    if (!window.confirm(`Create an employee profile for ${fullName}?`)) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/erp/candidates/${id}/finish-onboarding`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as {
      employeeId?: string;
      error?: string;
    };
    setLoading(false);

    if (res.status === 409 && json.employeeId) {
      setExistingEmployeeId(json.employeeId);
      return;
    }
    if (!res.ok) {
      setError(json.error ?? "Something went wrong");
      return;
    }

    router.push(`/erp/employees/${json.employeeId}`);
  }

  if (!isOnboarding) return null;

  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
        Finish onboarding
      </h2>

      {pendingDocs.length > 0 && (
        <p className="text-xs text-amber-600">
          {pendingDocs.length} document{pendingDocs.length !== 1 ? "s" : ""} still pending:{" "}
          {pendingDocs.map((p) => p.label).join(", ")}
        </p>
      )}

      {existingEmployeeId ? (
        <div className="space-y-2">
          <p className="text-sm text-amber-700">
            An employee profile already exists for this email.
          </p>
          <a
            href={`/erp/employees/${existingEmployeeId}`}
            className="inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            View employee profile →
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void finish()}
            disabled={loading}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Finish onboarding → Add as employee"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}