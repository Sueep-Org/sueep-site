"use client";

import { useRef, useState } from "react";

const MARKETS = [
  "Jacksonville, FL",
  "Tampa, FL",
  "New York City / New York Metro",
  "Miami, FL",
  "Philadelphia, PA",
  "New Jersey",
  "Other",
];

const MARKET_PREFERENCES = [
  { value: "current", label: "Current market" },
  { value: "relocating", label: "Relocating" },
  { value: "either", label: "Open to either" },
  { value: "not_sure", label: "Not sure yet" },
];

const LAUNCH_TIMELINES = [
  { value: "immediately", label: "Immediately" },
  { value: "3_months", label: "Within 3 months" },
  { value: "3_6_months", label: "3–6 months" },
  { value: "6_12_months", label: "6–12 months" },
  { value: "12_plus", label: "12+ months" },
  { value: "exploring", label: "Just exploring" },
];

const EXPERIENCE_AREAS = [
  "Sales / Business Development",
  "Business Ownership",
  "Construction",
  "Property Management",
  "Facilities / Commercial Services",
  "Operations / Management",
  "Real Estate",
  "Finance",
  "Other",
];

const INTERESTS = [
  "Building a commercial services business",
  "Recurring commercial contracts",
  "Construction cleaning",
  "Commercial painting",
  "Multifamily services",
  "Technology-enabled operations",
  "Building a team and scaling a local business",
  "Other",
];

const INVOLVEMENT_OPTIONS = [
  { value: "full_time", label: "Yes, full-time" },
  { value: "part_time", label: "Yes, part-time" },
  { value: "hire_manager", label: "I would hire a manager/operator" },
  { value: "not_sure", label: "Not sure yet" },
];

const inputClass =
  "w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const sectionHeadingClass = "text-lg font-bold text-gray-900 uppercase tracking-wide";
const primaryButtonClass =
  "inline-flex justify-center items-center px-6 py-3.5 rounded-lg bg-[#E73C6E] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity min-h-[48px] disabled:opacity-50";

export function FranchiseInquiryForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [contactSummary, setContactSummary] = useState<{ firstName: string; email: string } | null>(null);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [interestsError, setInterestsError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleNext() {
    const form = formRef.current;
    if (!form) return;
    // Only the Contact Information fields are mounted at step 1, so this
    // validates (and shows the browser's own bubble for) just those.
    if (!form.reportValidity()) return;

    const fd = new FormData(form);
    const firstName = String(fd.get("firstName") || "").trim();
    const lastName = String(fd.get("lastName") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    const cityState = String(fd.get("cityState") || "").trim();
    const agreedToContact = fd.get("agreedToContact");

    setSavingContact(true);
    setNextError(null);
    try {
      const res = await fetch("/api/franchise-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          cityState,
          agreedToContact,
          _honey: fd.get("_honey") || "",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) {
        setNextError(json.error || "Something went wrong. Please try again.");
        return;
      }
      setInquiryId(json.id || null);
      setContactSummary({ firstName, email });
      setStep(2);
    } catch {
      setNextError("Something went wrong. Please check your connection and try again.");
    } finally {
      setSavingContact(false);
    }
  }

  async function handleSubmit() {
    const form = formRef.current;
    if (!form || !inquiryId) return;
    // Now the rest of the sections are mounted too, so this validates the
    // whole form (step 1's already-saved fields plus everything below).
    // Note: this does NOT cover "interests" below, checked separately next
    // (unlike radio buttons, a group of same-name checkboxes doesn't get
    // "at least one required" from the required attribute; each required
    // checkbox has to be individually checked, so marking them all required
    // would demand every single interest be selected).
    if (!form.reportValidity()) return;

    const fd = new FormData(form);
    const interests = fd.getAll("interests");
    if (interests.length === 0) {
      setInterestsError("Select at least one option.");
      return;
    }
    setInterestsError(null);

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/franchise-inquiries/${inquiryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: fd.get("market"),
          marketPreference: fd.get("marketPreference"),
          launchTimeline: fd.get("launchTimeline"),
          currentOccupation: fd.get("currentOccupation"),
          ownsBusiness: fd.get("ownsBusiness"),
          previousFranchise: fd.get("previousFranchise"),
          experienceAreas: fd.getAll("experienceAreas"),
          backgroundText: fd.get("backgroundText"),
          interests,
          involvement: fd.get("involvement"),
          goalsText: fd.get("goalsText"),
          additionalInfo: fd.get("additionalInfo"),
        }),
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
        <h3 className="text-lg font-bold text-emerald-900">Thanks{contactSummary ? `, ${contactSummary.firstName}` : ""}!</h3>
        <p className="mt-2 text-sm text-emerald-800">
          We received your franchise inquiry. Our team will review it and reach out about next steps.
        </p>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => e.preventDefault()}
      className="mt-8 grid grid-cols-1 gap-8 bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm"
      autoComplete="on"
    >
      <input type="text" name="_honey" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      <div className="grid grid-cols-1 gap-4">
        <h3 className={sectionHeadingClass}>Contact Information</h3>

        <div>
          <label htmlFor="firstName" className={labelClass}>
            First Name <span className="text-red-500">*</span>
          </label>
          <input id="firstName" name="firstName" type="text" required className={inputClass} autoComplete="given-name" />
        </div>

        <div>
          <label htmlFor="lastName" className={labelClass}>
            Last Name <span className="text-red-500">*</span>
          </label>
          <input id="lastName" name="lastName" type="text" required className={inputClass} autoComplete="family-name" />
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Email Address <span className="text-red-500">*</span>
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
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input id="phone" name="phone" type="tel" required className={inputClass} autoComplete="tel" />
        </div>

        <div>
          <label htmlFor="cityState" className={labelClass}>
            Current City & State <span className="text-red-500">*</span>
          </label>
          <input
            id="cityState"
            name="cityState"
            type="text"
            required
            className={inputClass}
            placeholder="City, State"
            autoComplete="address-level2"
          />
        </div>

        <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" name="agreedToContact" value="yes" required className="mt-0.5 accent-[#E73C6E]" />
          <span>
            I agree to be contacted by Sueep regarding franchise opportunities and understand that submitting this
            form does not constitute a franchise agreement or offer.
          </span>
        </label>

        {step === 2 ? (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            Saved. Our team can follow up using this even if you do not finish the rest of the form.
          </p>
        ) : (
          <>
            {nextError && <p className="text-sm text-red-500">{nextError}</p>}
            <button type="button" onClick={() => void handleNext()} disabled={savingContact} className={primaryButtonClass}>
              {savingContact ? "Saving…" : "Next"}
            </button>
          </>
        )}
      </div>

      {step === 2 && (
        <>
          <div className="grid grid-cols-1 gap-4">
            <h3 className={sectionHeadingClass}>Your Interest</h3>

            <div>
              <label htmlFor="market" className={labelClass}>
                Which market are you interested in? <span className="text-red-500">*</span>
              </label>
              <select id="market" name="market" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  Select a market
                </option>
                {MARKETS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>
                Are you interested in operating the business in your current market or relocating to another
                market? <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 space-y-2">
                {MARKET_PREFERENCES.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="marketPreference" value={opt.value} required className="accent-[#E73C6E]" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>
                When would you ideally like to launch? <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 space-y-2">
                {LAUNCH_TIMELINES.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="launchTimeline" value={opt.value} required className="accent-[#E73C6E]" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <h3 className={sectionHeadingClass}>Your Background</h3>

            <div>
              <label htmlFor="currentOccupation" className={labelClass}>
                What do you currently do? <span className="text-red-500">*</span>
              </label>
              <input id="currentOccupation" name="currentOccupation" type="text" required className={inputClass} />
            </div>

            <div>
              <label className={labelClass}>
                Do you currently own or operate a business? <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-6 mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="ownsBusiness" value="yes" required className="accent-[#E73C6E]" />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="ownsBusiness" value="no" required className="accent-[#E73C6E]" />
                  No
                </label>
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Have you previously owned or operated a franchise? <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-6 mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="previousFranchise" value="yes" required className="accent-[#E73C6E]" />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="previousFranchise" value="no" required className="accent-[#E73C6E]" />
                  No
                </label>
              </div>
            </div>

            <div>
              <label className={labelClass}>Which areas best describe your experience?</label>
              <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXPERIENCE_AREAS.map((area) => (
                  <label key={area} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" name="experienceAreas" value={area} className="accent-[#E73C6E]" />
                    {area}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="backgroundText" className={labelClass}>
                Tell us briefly about your professional or business background.
              </label>
              <textarea id="backgroundText" name="backgroundText" rows={4} className={`${inputClass} resize-y min-h-[100px]`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <h3 className={sectionHeadingClass}>Your Goals</h3>

            <div>
              <label className={labelClass}>
                What interests you most about the Sueep franchise? <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INTERESTS.map((interest) => (
                  <label key={interest} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" name="interests" value={interest} className="accent-[#E73C6E]" />
                    {interest}
                  </label>
                ))}
              </div>
              {interestsError && <p className="mt-1 text-sm text-red-500">{interestsError}</p>}
            </div>

            <div>
              <label className={labelClass}>
                Would you plan to be actively involved in operating the business?{" "}
                <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 space-y-2">
                {INVOLVEMENT_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="involvement" value={opt.value} required className="accent-[#E73C6E]" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="goalsText" className={labelClass}>
                What are you hoping to accomplish by owning a Sueep franchise?
              </label>
              <textarea id="goalsText" name="goalsText" rows={4} className={`${inputClass} resize-y min-h-[100px]`} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <h3 className={sectionHeadingClass}>Let&apos;s Talk</h3>

            <div>
              <label htmlFor="additionalInfo" className={labelClass}>
                Is there anything else you&apos;d like us to know about your interest in Sueep?
              </label>
              <textarea id="additionalInfo" name="additionalInfo" rows={4} className={`${inputClass} resize-y min-h-[100px]`} />
            </div>
          </div>

          {submitError && <p className="text-sm text-red-500">{submitError}</p>}
          <button type="button" onClick={() => void handleSubmit()} disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Submitting…" : "Submit Franchise Inquiry"}
          </button>
        </>
      )}
    </form>
  );
}
