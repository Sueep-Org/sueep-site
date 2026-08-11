import { SUBCONTRACTOR_QUESTIONNAIRE, subFieldName } from "@/lib/erp/subcontractorQuestionnaire";
import { formatSubValue } from "./subcontractorFieldUi";

/** Read-only display of the subcontractor questionnaire answers, pulled
 * straight out of CandidateApplication.responses (sub_* keys) using the same
 * section/field config the public /careers form renders from, see
 * lib/erp/subcontractorQuestionnaire.ts.
 *
 * excludeSectionIds lets a caller that already shows some sections elsewhere
 * (the Contractor profile's Company profile / Insurance / Licensing cards)
 * skip re-showing those same answers here — the Candidate profile doesn't
 * pass this, so it keeps showing the full questionnaire. */
export function SubcontractorInfoSection({
  responses,
  excludeSectionIds = [],
}: {
  responses: Record<string, unknown>;
  excludeSectionIds?: string[];
}) {
  const sections = SUBCONTRACTOR_QUESTIONNAIRE.filter((s) => !excludeSectionIds.includes(s.id));
  return (
    <div className="space-y-8">
      {sections.map((section) => (
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
                  {formatSubValue(responses[subFieldName(field.key)])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
