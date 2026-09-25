"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subFieldName, type SubField } from "@/lib/erp/subcontractorQuestionnaire";
import { subFieldInput } from "../../candidates/[id]/subcontractorFieldUi";

type Props = {
  contractorId: string;
  title: string;
  fields: SubField[];
  /** True when a CandidateApplication is linked, so some of initialValues
   * came from it (see ContractorApplicationLinkSection). Only changes the
   * helper text; the section stays editable either way. */
  fromApplication: boolean;
  /** sub_<key>-keyed values: what's saved on the contractor, falling back
   * to the linked application's answer for fields never edited here. */
  initialValues: Record<string, string>;
};

/** One topic's worth of subcontractor-questionnaire fields (Company profile,
 * Licensing), always editable. Edits are saved on the contractor
 * (Contractor.manualApplicationInfo), never on the linked application, and
 * only the fields actually changed are sent, so untouched fields keep
 * following the application. */
export function ContractorQuestionnaireCard({ contractorId, title, fields, fromApplication, initialValues }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSave() {
    setSaving(true);
    setError("");
    setOk("");
    const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== (initialValues[k] ?? "")));
    try {
      const res = await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manualApplicationInfo: changed }),
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
    <div className="mt-3 space-y-4">
      {fromApplication ? (
        <p className="text-xs text-gray-400">
          Pre-filled from the linked subcontractor application. Changes are saved on this contractor and don&apos;t alter the original application.
        </p>
      ) : null}
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.key} className={field.type === "checkboxGroup" || field.type === "textarea" ? "sm:col-span-2" : ""}>
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
  );
}
