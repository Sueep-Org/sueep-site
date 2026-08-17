"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm, useToast } from "@/app/erp/components/ui";

type PaperworkItem = { label: string; url: string };

type Props = {
  id: string;
  fullName: string;
  status: string;
  paperwork: PaperworkItem[];
};

export function FinishOnboardingPanel({ id, fullName, status, paperwork }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [existingEmployeeId, setExistingEmployeeId] = useState<string | null>(null);
  const [existingMatchReason, setExistingMatchReason] = useState<"email" | "name">("email");

  const isOnboarding = status === "ONBOARDING";
  const pendingDocs = paperwork.filter((p) => !p.url);

  async function finish() {
    if (!(await confirm({ message: `Create an employee profile for ${fullName}?`, danger: false, confirmLabel: "Create" }))) return;
    setLoading(true);

    const res = await fetch(`/api/erp/candidates/${id}/finish-onboarding`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as {
      employeeId?: string;
      error?: string;
      reason?: "email" | "name";
    };
    setLoading(false);

    if (res.status === 409 && json.employeeId) {
      setExistingEmployeeId(json.employeeId);
      setExistingMatchReason(json.reason === "name" ? "name" : "email");
      return;
    }
    if (!res.ok) {
      toast(json.error ?? "Something went wrong", "error");
      return;
    }

    router.push(`/erp/employees/${json.employeeId}`);
  }

  async function merge() {
    if (!existingEmployeeId) return;
    if (
      !(await confirm({
        message: `Merge this application into the existing employee profile for ${fullName}? Missing details (phone, bank info) will be filled in from this application, and its documents will be added to that profile. Nothing already on the employee profile will be overwritten.`,
        danger: false,
        confirmLabel: "Merge",
      }))
    )
      return;
    setLoading(true);

    const res = await fetch(`/api/erp/candidates/${id}/finish-onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mergeIntoEmployeeId: existingEmployeeId }),
    });
    const json = (await res.json().catch(() => ({}))) as { employeeId?: string; error?: string };
    setLoading(false);

    if (!res.ok) {
      toast(json.error ?? "Something went wrong", "error");
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
            {existingMatchReason === "name"
              ? "An employee profile already exists with this name."
              : "An employee profile already exists for this email."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/erp/employees/${existingEmployeeId}`}
              className="inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              View employee profile →
            </a>
            <button
              type="button"
              onClick={() => void merge()}
              disabled={loading}
              className="inline-block rounded-md border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {loading ? "Merging…" : "Merge into that profile"}
            </button>
          </div>
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
        </div>
      )}
    </div>
  );
}