"use client";

import { useRef, useState } from "react";
import { RoleAndExperienceFields } from "./RoleAndExperienceFields";
import { SubcontractorGateQuestion, SubcontractorQuestionnaireFields } from "./SubcontractorQuestionnaire";
import { fireCareersLeadPixels } from "./CareersPixelEvents";

const inputClass =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const primaryButtonClass =
  "mt-2 inline-flex justify-center items-center px-6 py-3.5 rounded-lg bg-[#E73C6E] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity min-h-[48px] disabled:opacity-50";

export function CareersApplicationForm({
  defaultCleaner,
  defaultPainter,
  defaultSupervisor,
}: {
  defaultCleaner: boolean;
  defaultPainter: boolean;
  defaultSupervisor: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubcontractor, setIsSubcontractor] = useState<"" | "yes" | "no">("");
  const [applicantName, setApplicantName] = useState("");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleNext() {
    const form = formRef.current;
    if (!form) return;
    // Only step 1's fields are mounted right now, so this validates (and
    // shows the browser's own bubble for) just those.
    if (!form.reportValidity()) return;

    const fd = new FormData(form);
    const roles = fd.getAll("roles").filter((v): v is string => typeof v === "string");
    // RoleAndExperienceFields already renders its own "Select at least one
    // position." hint whenever none are checked, unlike the other required
    // fields above this isn't native-checkbox-validatable (a group of
    // same-name checkboxes doesn't get "at least one required" the way
    // radios do), so there's nothing more to show here.
    if (roles.length === 0) return;

    setSavingContact(true);
    setNextError(null);
    try {
      const res = await fetch("/api/candidate-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fd.get("fullName"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          location: fd.get("location"),
          roles,
          cleaningExperience: fd.get("cleaningExperience"),
          cleaningYears: fd.get("cleaningYears"),
          paintingExperience: fd.get("paintingExperience"),
          paintingYears: fd.get("paintingYears"),
          supervisingYears: fd.get("supervisingYears"),
          speaksEnglish: fd.get("speaksEnglish"),
          speaksSpanish: fd.get("speaksSpanish"),
          hasVehicle: fd.get("hasVehicle"),
          _honey: fd.get("_honey") || "",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) {
        setNextError(json.error || "Something went wrong. Please try again.");
        return;
      }
      setApplicationId(json.id || null);
      setApplicantName(String(fd.get("fullName") || "").trim());
      fireCareersLeadPixels({
        cleaner: roles.includes("cleaner"),
        painter: roles.includes("painter"),
        supervisor: roles.includes("supervisor"),
      });
      setStep(2);
    } catch {
      setNextError("Something went wrong. Please check your connection and try again.");
    } finally {
      setSavingContact(false);
    }
  }

  async function handleSubmit() {
    const form = formRef.current;
    if (!form || !applicationId) return;

    const fd = new FormData(form);
    // Every sub_* field (the subcontractor questionnaire, and its
    // sub_isSubcontractor gate) passes through as-is, same generic
    // passthrough the old single-step API route used to do server-side.
    // Nothing here is required, see SubcontractorQuestionnaire.tsx.
    const subPayload: Record<string, string | string[]> = {};
    for (const key of new Set(fd.keys())) {
      if (!key.startsWith("sub_")) continue;
      const values = fd.getAll(key).filter((v): v is string => typeof v === "string" && v.trim() !== "");
      if (values.length === 0) continue;
      subPayload[key] = values.length > 1 ? values : values[0];
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/candidate-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...subPayload, additionalNotes: fd.get("additionalNotes") }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSubmitError(json.error || "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError("Something went wrong. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8 text-center">
        <h3 className="text-lg font-bold text-emerald-900">Thanks{applicantName ? `, ${applicantName}` : ""}!</h3>
        <p className="mt-2 text-sm text-emerald-800">
          We received your application. Our team will review it and reach out if there&apos;s a next step.
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => e.preventDefault()}
      className="mt-8 grid grid-cols-1 gap-4 bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm"
      autoComplete="on"
    >
      <input type="text" name="_honey" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <div>
        <label htmlFor="fullName" className={labelClass}>
          Full name <span className="text-red-500">*</span>
        </label>
        <input id="fullName" name="fullName" type="text" required className={inputClass} placeholder="Your name" />
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          Email <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className={inputClass}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          className={inputClass}
          placeholder="Best number to reach you"
          autoComplete="tel"
        />
      </div>

      <div>
        <label htmlFor="location" className={labelClass}>
          Location <span className="text-red-500">*</span>
        </label>
        <input
          id="location"
          name="location"
          type="text"
          required
          className={inputClass}
          placeholder="City, State (e.g. Philadelphia, PA)"
          autoComplete="address-level2"
        />
      </div>

      <RoleAndExperienceFields
        defaultCleaner={defaultCleaner}
        defaultPainter={defaultPainter}
        defaultSupervisor={defaultSupervisor}
      />

      <div>
        <label className={labelClass}>
          Do you have a vehicle? <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-6 mt-1">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name="hasVehicle" value="yes" required className="accent-[#E73C6E]" />
            Yes
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name="hasVehicle" value="no" required className="accent-[#E73C6E]" />
            No
          </label>
        </div>
      </div>

      <SubcontractorGateQuestion value={isSubcontractor} onChange={setIsSubcontractor} />

      {step === 1 ? (
        <>
          {nextError && <p className="text-sm text-red-500">{nextError}</p>}
          <button type="button" onClick={() => void handleNext()} disabled={savingContact} className={primaryButtonClass}>
            {savingContact ? "Saving…" : "Next"}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            Your contact info is saved. Our hiring team can follow up using it even if you do not finish the rest of
            the form.
          </p>

          {isSubcontractor === "yes" && <SubcontractorQuestionnaireFields />}

          <div>
            <label htmlFor="additionalNotes" className={labelClass}>
              Additional comments
            </label>
            <textarea
              id="additionalNotes"
              name="additionalNotes"
              rows={4}
              className={`${inputClass} resize-y min-h-[100px]`}
              placeholder="Anything else you'd like us to know…"
            />
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            By submitting, you agree we may contact you about opportunities at Sueep. We use your information only
            for hiring and onboarding.
          </p>

          {submitError && <p className="text-sm text-red-500">{submitError}</p>}
          <button type="button" onClick={() => void handleSubmit()} disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Submitting…" : "Submit application"}
          </button>
        </>
      )}
    </form>
  );
}
