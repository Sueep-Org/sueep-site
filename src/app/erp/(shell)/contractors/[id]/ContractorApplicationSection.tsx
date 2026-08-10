"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { SubcontractorInfoSection } from "../../candidates/[id]/SubcontractorInfoSection";
import { ContractorManualApplicationInfoForm } from "./ContractorManualApplicationInfoForm";
import { subFieldName, CONTRACTOR_MANUAL_SECTIONS } from "@/lib/erp/subcontractorQuestionnaire";

type LinkedApplication = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  positionInterest: string | null;
  responses: Record<string, unknown>;
};

type LinkableOption = { id: string; fullName: string; email: string };

type Props = {
  contractorId: string;
  linkedApplication: LinkedApplication | null;
  linkableApplications: LinkableOption[];
  manualApplicationInfo: Record<string, unknown> | null;
};

export function ContractorApplicationSection({
  contractorId,
  linkedApplication,
  linkableApplications,
  manualApplicationInfo,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const manualFormInitial: Record<string, string> = {};
  for (const section of CONTRACTOR_MANUAL_SECTIONS) {
    for (const field of section.fields) {
      const key = subFieldName(field.key);
      const value = manualApplicationInfo?.[key];
      manualFormInitial[key] = typeof value === "string" ? value : "";
    }
  }

  async function patchLink(candidateApplicationId: string | null) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateApplicationId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Save failed");
        setSaving(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  if (linkedApplication) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-pink-500">Applicant name</dt>
              <dd className="text-gray-800">{linkedApplication.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">Email</dt>
              <dd className="text-gray-800">{linkedApplication.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">Phone</dt>
              <dd className="text-gray-800">{linkedApplication.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">Position interest</dt>
              <dd className="text-gray-800">{linkedApplication.positionInterest ?? "—"}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => {
              if (confirm("Unlink this application from the contractor profile?")) void patchLink(null);
            }}
            disabled={saving}
            className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Unlink
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <SubcontractorInfoSection responses={linkedApplication.responses} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {linkableApplications.length === 0 ? (
        <p className="text-xs text-gray-400">No unlinked subcontractor applications found.</p>
      ) : (
        <div className="flex items-end gap-3">
          <div className="max-w-sm flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Subcontractor application</label>
            <SearchableSelect
              value={selected}
              onChange={setSelected}
              options={linkableApplications.map((a) => ({ value: a.id, label: `${a.fullName} — ${a.email}` }))}
              placeholder="Search applications…"
              allLabel="— None —"
            />
          </div>
          <button
            type="button"
            onClick={() => void patchLink(selected)}
            disabled={!selected || saving}
            className="rounded-md bg-[#E73C6E] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Linking…" : "Link"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="border-t border-gray-200 pt-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Or enter manually</h3>
        <ContractorManualApplicationInfoForm contractorId={contractorId} initial={manualFormInitial} />
      </div>
    </div>
  );
}
