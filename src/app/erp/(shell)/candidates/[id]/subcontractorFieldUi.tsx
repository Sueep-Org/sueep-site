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
 * yes/no vs checkboxes vs text), shared by every place that lets staff
 * fill in questionnaire answers on a contractor profile. */
export function subFieldInput(field: SubField, value: string, onChange: (v: string) => void) {
  if (field.type === "yesno") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={subInputCls}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    );
  }
  if (field.type === "textarea") {
    return <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={subInputCls} />;
  }
  if (field.type === "checkboxGroup") {
    // Stored as a ", "-joined string on the contractor (application answers
    // arrive as arrays and are joined the same way before reaching here).
    const picked = new Set(value.split(",").map((v) => v.trim()).filter(Boolean));
    const toggle = (opt: string) => {
      const next = new Set(picked);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      onChange((field.options ?? []).filter((o) => next.has(o)).join(", "));
    };
    return (
      <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
        {(field.options ?? []).map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={picked.has(opt)}
              onChange={() => toggle(opt)}
              className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
            />
            {opt}
          </label>
        ))}
      </div>
    );
  }
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
