"use client";

import { useState } from "react";
import {
  SUBCONTRACTOR_QUESTIONNAIRE,
  SUBCONTRACTOR_GATE_FIELD,
  subFieldName,
  type SubField,
} from "@/lib/erp/subcontractorQuestionnaire";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

function FieldInput({ field }: { field: SubField }) {
  const name = subFieldName(field.key);
  const labelNode = (
    <span>
      {field.label}
      {field.optional ? <span className="text-gray-400 font-normal"> (optional)</span> : null}
    </span>
  );

  if (field.type === "yesno") {
    return (
      <div>
        <label className={labelClass}>{labelNode}</label>
        <div className="flex gap-6 mt-1">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name={name} value="Yes" className="accent-[#E73C6E]" />
            Yes
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name={name} value="No" className="accent-[#E73C6E]" />
            No
          </label>
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <label htmlFor={name} className={labelClass}>
          {labelNode}
        </label>
        <select id={name} name={name} className={inputClass} defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "checkboxGroup") {
    return (
      <div>
        <label className={labelClass}>{labelNode}</label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {field.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" name={name} value={o} className="accent-[#E73C6E]" />
              {o}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        <label htmlFor={name} className={labelClass}>
          {labelNode}
        </label>
        <textarea id={name} name={name} rows={3} className={`${inputClass} resize-y`} />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {labelNode}
      </label>
      <input id={name} name={name} type={field.type === "number" ? "number" : "text"} className={inputClass} />
    </div>
  );
}

/** Rendered inline inside the /careers <form> (same POST, same submit
 * button). It's just more fields under the same names, not a separate
 * submission. Nothing here is "required" at the HTML level: subcontractors
 * vary in what they can answer up front, and gating submission on 80 fields
 * would just push people to abandon the application. */
export function SubcontractorQuestionnaire() {
  const [isSubcontractor, setIsSubcontractor] = useState<"" | "yes" | "no">("");

  return (
    <div className="border-t border-gray-200 pt-6">
      <label className={labelClass}>Are you applying as a subcontractor (a company, not an individual)?</label>
      <div className="flex gap-6 mt-1">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="radio"
            name={SUBCONTRACTOR_GATE_FIELD}
            value="Yes"
            className="accent-[#E73C6E]"
            checked={isSubcontractor === "yes"}
            onChange={() => setIsSubcontractor("yes")}
          />
          Yes
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="radio"
            name={SUBCONTRACTOR_GATE_FIELD}
            value="No"
            className="accent-[#E73C6E]"
            checked={isSubcontractor === "no"}
            onChange={() => setIsSubcontractor("no")}
          />
          No
        </label>
      </div>

      {isSubcontractor === "yes" && (
        <div className="mt-6 space-y-8">
          <p className="text-sm text-gray-600">
            Since you&apos;re applying as a subcontractor, we need some information about your company below.
          </p>
          {SUBCONTRACTOR_QUESTIONNAIRE.map((section) => (
            <div key={section.id}>
              <h3 className="text-base font-semibold text-gray-900 mb-3">{section.title}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {section.fields.map((field) => (
                  <div
                    key={field.key}
                    className={field.type === "checkboxGroup" || field.type === "textarea" ? "sm:col-span-2" : ""}
                  >
                    <FieldInput field={field} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
