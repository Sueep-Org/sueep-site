"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subFieldName, type SubField } from "@/lib/erp/subcontractorQuestionnaire";
import { formatSubValue, subFieldInput } from "../../candidates/[id]/subcontractorFieldUi";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

type Props = {
  contractorId: string;
  initial: {
    hasInsurance: boolean | null;
    workersCompCarrier: string | null;
    workersCompPolicyNumber: string | null;
    workersCompExpiresAt: string | null;
  };
  workersCompDoc: { id: string; filename: string } | null;
  /** The questionnaire's "insurance" section fields (general liability,
   * agent contact, etc.) — folded into this same card instead of a separate
   * Application Info block, so there's one Insurance section, not two. */
  questionnaireFields: SubField[];
  /** Present when a CandidateApplication is linked — those answers are
   * read-only here (edit via unlinking, see ContractorApplicationLinkSection). */
  linkedResponses: Record<string, unknown> | null;
  /** sub_<key>-keyed values from Contractor.manualApplicationInfo, used only when not linked. */
  manualInitial: Record<string, string>;
};

// yyyy-mm-dd for <input type="date">
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** Same always-visible, always-editable card style as the other Contractor
 * sections — no "Enter manually" gate. The certificate of insurance itself
 * is uploaded via the Documents section below; this just links to it. */
export function ContractorInsuranceSection({
  contractorId,
  initial,
  workersCompDoc,
  questionnaireFields,
  linkedResponses,
  manualInitial,
}: Props) {
  const router = useRouter();
  const [hasInsurance, setHasInsurance] = useState<boolean | null>(initial.hasInsurance);
  const [carrier, setCarrier] = useState(initial.workersCompCarrier ?? "");
  const [policyNumber, setPolicyNumber] = useState(initial.workersCompPolicyNumber ?? "");
  const [expiresAt, setExpiresAt] = useState(toDateInputValue(initial.workersCompExpiresAt));
  const [questionnaireValues, setQuestionnaireValues] = useState<Record<string, string>>(manualInitial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk("");
    try {
      const body: Record<string, unknown> = {
        hasInsurance,
        workersCompCarrier: carrier || null,
        workersCompPolicyNumber: policyNumber || null,
        workersCompExpiresAt: expiresAt || null,
      };
      // Questionnaire answers are read-only while linked to an application —
      // only send them along when they're actually the editable, manual copy.
      if (!linkedResponses) body.manualApplicationInfo = questionnaireValues;

      const res = await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setOk("Insurance info updated.");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const expiryStatus = (() => {
    if (!initial.workersCompExpiresAt) return null;
    const days = (new Date(initial.workersCompExpiresAt).getTime() - Date.now()) / 86_400_000;
    const display = new Date(initial.workersCompExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const cls = days < 0 ? "text-red-500" : days <= 30 ? "text-amber-600" : "text-emerald-600";
    const suffix = days < 0 ? " (expired)" : days <= 30 ? " (expiring soon)" : "";
    return <span className={`font-medium ${cls}`}>{display}{suffix}</span>;
  })();

  return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className={label}>Has insurance</label>
          <div className="mt-1 flex gap-4">
            {(["yes", "no", "unknown"] as const).map((opt) => (
              <label key={opt} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="hasInsurance"
                  checked={opt === "yes" ? hasInsurance === true : opt === "no" ? hasInsurance === false : hasInsurance === null}
                  onChange={() => setHasInsurance(opt === "yes" ? true : opt === "no" ? false : null)}
                  className="accent-pink-600"
                />
                <span className="text-gray-700">{opt === "unknown" ? "Unknown" : opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="workersCompCarrier">
              Workers comp carrier
            </label>
            <input id="workersCompCarrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="workersCompPolicyNumber">
              Workers comp policy number
            </label>
            <input id="workersCompPolicyNumber" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="workersCompExpiresAt">
              Workers comp expires
            </label>
            <input
              id="workersCompExpiresAt"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={input}
            />
            {expiryStatus && <p className="mt-1 text-xs">{expiryStatus}</p>}
          </div>
          <div>
            <label className={label}>Certificate of insurance</label>
            <div className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
              {workersCompDoc ? (
                <a
                  href={`/api/erp/contractors/${contractorId}/documents/${workersCompDoc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink-600 hover:underline"
                >
                  {workersCompDoc.filename}
                </a>
              ) : (
                <span className="text-gray-400">Upload via Documents below</span>
              )}
            </div>
          </div>
        </div>

        {questionnaireFields.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {linkedResponses ? "From the linked subcontractor application" : "Additional coverage (subcontractor questionnaire)"}
            </h3>
            {linkedResponses ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {questionnaireFields.map((field) => (
                  <div key={field.key}>
                    <dt className="text-xs text-pink-500">{field.label}</dt>
                    <dd className="mt-0.5 text-gray-800 whitespace-pre-wrap">{formatSubValue(linkedResponses[subFieldName(field.key)])}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                {questionnaireFields.map((field) => (
                  <div key={field.key}>
                    <label className={label}>{field.label}</label>
                    {subFieldInput(field, questionnaireValues[subFieldName(field.key)] ?? "", (v) =>
                      setQuestionnaireValues((prev) => ({ ...prev, [subFieldName(field.key)]: v }))
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {ok ? <p className="text-xs text-emerald-600">{ok}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save insurance info"}
        </button>
      </form>
  );
}
