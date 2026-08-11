import type { SubField } from "@/lib/erp/subcontractorQuestionnaire";

/** Formats a raw questionnaire response value (string/number/boolean/array)
 * for read-only display — shared by SubcontractorInfoSection and the
 * Contractor profile's Company profile / Insurance / Licensing cards. */
export function formatSubValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : "—";
  return String(v);
}

const subInputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

/** Renders the right control for a questionnaire SubField (select vs
 * text/number) — shared by every place that lets staff manually fill in
 * questionnaire answers for a contractor with no linked application. */
export function subFieldInput(field: SubField, value: string, onChange: (v: string) => void) {
  if (field.type === "select") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={subInputCls}>
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
      className={subInputCls}
    />
  );
}
