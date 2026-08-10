"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONTRACTOR_MANUAL_SECTIONS, subFieldName, type SubField } from "@/lib/erp/subcontractorQuestionnaire";

type Props = {
  contractorId: string;
  initial: Record<string, string>;
};

const inputCls =
  "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const labelCls = "text-xs text-pink-500 block mb-0.5";

function fieldInput(field: SubField, value: string, onChange: (v: string) => void) {
  if (field.type === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">— Select —</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

export function ContractorManualApplicationInfoForm({ contractorId, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function setField(key: string, v: string) {
    setValues((prev) => ({ ...prev, [subFieldName(key)]: v }));
  }

  async function onSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manualApplicationInfo: values }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Save failed");
        setSaving(false);
        return;
      }
      setSaved(true);
      setSaving(false);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {CONTRACTOR_MANUAL_SECTIONS.map((section) => (
        <div key={section.id}>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{section.title}</h3>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.key}>
                <label className={labelCls}>{field.label}</label>
                {fieldInput(field, values[subFieldName(field.key)] ?? "", (v) => setField(field.key, v))}
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
    </div>
  );
}
