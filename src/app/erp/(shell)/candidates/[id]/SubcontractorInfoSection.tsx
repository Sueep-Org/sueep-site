import { SUBCONTRACTOR_QUESTIONNAIRE, subFieldName } from "@/lib/erp/subcontractorQuestionnaire";

function formatValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : "—";
  return String(v);
}

/** Read-only display of the subcontractor questionnaire answers, pulled
 * straight out of CandidateApplication.responses (sub_* keys) using the same
 * section/field config the public /careers form renders from, see
 * lib/erp/subcontractorQuestionnaire.ts. */
export function SubcontractorInfoSection({ responses }: { responses: Record<string, unknown> }) {
  return (
    <div className="space-y-8">
      {SUBCONTRACTOR_QUESTIONNAIRE.map((section) => (
        <div key={section.id}>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{section.title}</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {section.fields.map((field) => (
              <div
                key={field.key}
                className={field.type === "checkboxGroup" || field.type === "textarea" ? "sm:col-span-2" : ""}
              >
                <dt className="text-pink-500">{field.label}</dt>
                <dd className="mt-0.5 text-zinc-600 whitespace-pre-wrap">
                  {formatValue(responses[subFieldName(field.key)])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
