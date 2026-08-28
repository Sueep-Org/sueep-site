"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { SubcontractorInfoSection } from "../../candidates/[id]/SubcontractorInfoSection";

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
};

/** Just the data-source control: which /careers subcontractor application (if
 * any) this contractor is linked to. The Company profile, Insurance, and
 * Licensing cards elsewhere on the profile read from whatever this points
 * at, so it doesn't duplicate those answers itself — it only shows the
 * sections that have no other home on the profile (experience, workforce,
 * safety, financials, etc.), tucked under a disclosure since they're
 * reference-only. */
export function ContractorApplicationLinkSection({ contractorId, linkedApplication, linkableApplications }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div>
      <p className="text-xs text-gray-500">
        Links a submitted /careers application so Company profile, Insurance, and Licensing read from it instead of manual entry.
      </p>

      {linkedApplication ? (
        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
          <span className="text-gray-800">
            Linked to <span className="font-medium">{linkedApplication.fullName}</span> ({linkedApplication.email}
            {linkedApplication.phone ? `, ${linkedApplication.phone}` : ""})
            {linkedApplication.positionInterest ? <span className="text-gray-500"> · {linkedApplication.positionInterest}</span> : null}
          </span>
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
      ) : linkableApplications.length === 0 ? (
        <p className="mt-3 text-xs text-gray-400">No unlinked subcontractor applications found — enter details manually in the sections below.</p>
      ) : (
        <div className="mt-3 flex items-end gap-3">
          <div className="max-w-sm flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">Search applications</label>
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
            className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-40"
          >
            {saving ? "Linking…" : "Link"}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {linkedApplication && (
        <details className="mt-4 border-t border-gray-200 pt-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
            More from their application (experience, workforce, safety, financials…)
          </summary>
          <div className="mt-3">
            <SubcontractorInfoSection responses={linkedApplication.responses} excludeSectionIds={["company", "insurance", "licensing"]} />
          </div>
        </details>
      )}
    </div>
  );
}
