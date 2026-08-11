"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subFieldName, type SubField } from "@/lib/erp/subcontractorQuestionnaire";
import { formatSubValue, subFieldInput } from "../../candidates/[id]/subcontractorFieldUi";

type Props = {
  contractorId: string;
  title: string;
  fields: SubField[];
  /** Present when a CandidateApplication is linked (see ContractorApplicationLinkSection)
   * — those answers belong to that record, so they're read-only here; unlink
   * to enter this section manually instead. */
  linkedResponses: Record<string, unknown> | null;
  /** sub_<key>-keyed values already saved to Contractor.manualApplicationInfo,
   * only used (and only editable) when nothing is linked. */
  manualInitial: Record<string, string>;
};

/** One topic's worth of subcontractor-questionnaire fields (Company profile,
 * Licensing), sourced from whichever place the contractor's info actually
 * lives — a linked application (read-only) or manual entry (editable) — so
 * each topic is a single self-contained card instead of a separate
 * "Application Info" block duplicating what's above/below it. */
export function ContractorQuestionnaireCard({ contractorId, title, fields, linkedResponses, manualInitial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(manualInitial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSave() {
    setSaving(true);
    setError("");
    setOk("");
    try {
      const res = await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manualApplicationInfo: values }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      setOk("Saved.");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-sm font-semibold text-gray-800">{title}</h2>

      {linkedResponses ? (
        <>
          <p className="mt-1 text-xs text-gray-400">
            From the linked subcontractor application — unlink it above to enter this manually instead.
          </p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className={field.type === "checkboxGroup" || field.type === "textarea" ? "sm:col-span-2" : ""}>
                <dt className="text-xs text-pink-500">{field.label}</dt>
                <dd className="mt-0.5 text-gray-800 whitespace-pre-wrap">{formatSubValue(linkedResponses[subFieldName(field.key)])}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-600">{field.label}</label>
                {subFieldInput(field, values[subFieldName(field.key)] ?? "", (v) =>
                  setValues((prev) => ({ ...prev, [subFieldName(field.key)]: v }))
                )}
              </div>
            ))}
          </div>
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          {ok ? <p className="text-xs text-emerald-600">{ok}</p> : null}
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : `Save ${title.toLowerCase()}`}
          </button>
        </div>
      )}
    </section>
  );
}
