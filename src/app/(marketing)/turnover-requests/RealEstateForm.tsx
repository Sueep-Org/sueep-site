"use client";

import { useState } from "react";
import { DocusealForm } from "@docuseal/react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { paintingStripePromise } from "@/lib/stripePublishableClient";
import { computeTurnoverPricing } from "@/lib/turnoverPricing";
import { REAL_ESTATE_PRICING_PACKAGE } from "@/lib/turnoverPricingPackages";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const label = "block text-xs font-medium text-gray-600";

const PROPERTY_TYPES = ["House", "Condo", "Apartment", "Townhouse", "Multi-family"] as const;
const BEDROOM_OPTIONS = ["Studio", "1", "2", "3", "4+"] as const;
const BATHROOM_OPTIONS = ["1", "2", "3+"] as const;

const ALL_STEP_LABELS = ["Your Info", "Property Info", "Services", "Sign Contract", "Pay Deposit"] as const;
const NO_DEPOSIT_STEP_LABELS = ["Your Info", "Property Info", "Services", "Sign Contract"] as const;

interface FormState {
  // Step 1 — property
  address: string;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  squareFootage: string;
  furnished: boolean;
  // Step 2 — services
  fullClean: boolean;
  touchUpPaint: boolean;
  fullPaint: boolean;
  carpetCleaning: boolean;
  cleanDate: string;
  moveInDate: string;
  // Step 3 — agent info
  agentName: string;
  agentEmail: string;
  agentPhone: string;
  comments: string;
}

const initial: FormState = {
  address: "",
  propertyType: "",
  bedrooms: "",
  bathrooms: "",
  squareFootage: "",
  furnished: false,
  fullClean: false,
  touchUpPaint: false,
  fullPaint: false,
  carpetCleaning: false,
  cleanDate: "",
  moveInDate: "",
  agentName: "",
  agentEmail: "",
  agentPhone: "",
  comments: "",
};

function StepIndicator({ current, stepLabels }: { current: number; stepLabels: readonly string[] }) {
  const total = stepLabels.length;
  return (
    <div className="flex items-center gap-1.5 border-b border-gray-100 pb-4">
      {stepLabels.map((stepLabel, i) => {
        const s = i + 1;
        const done = s < current;
        const active = s === current;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done ? "bg-[#E73C6E] text-white" : active ? "bg-[#E73C6E] text-white ring-2 ring-pink-200" : "bg-gray-200 text-gray-500"
              }`}
            >
              {done ? "✓" : s}
            </div>
            {active && <span className="text-xs font-medium text-[#E73C6E]">{stepLabel}</span>}
            {s < total && (
              <div className={`h-px w-4 shrink-0 ${done ? "bg-[#E73C6E]" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ServiceCheckbox({
  checked,
  disabled,
  onChange,
  label: text,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className={`flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 cursor-pointer transition hover:border-pink-200 ${disabled ? "opacity-50 cursor-default" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded accent-[#E73C6E]"
      />
      <span className="text-sm text-gray-700">{text}</span>
    </label>
  );
}

function computePricing(form: FormState) {
  const bedroomValue = form.bedrooms === "Studio" ? 0 : form.bedrooms === "4+" ? 4 : Number(form.bedrooms) || undefined;
  const bathroomValue = form.bathrooms === "3+" ? 3 : Number(form.bathrooms) || undefined;
  return computeTurnoverPricing({
    requestType: "TURNOVER",
    pricingPackage: REAL_ESTATE_PRICING_PACKAGE,
    bedrooms: bedroomValue,
    bathrooms: bathroomValue,
    fullClean: form.fullClean,
    fullPaint: form.fullPaint,
    touchUpPaint: form.touchUpPaint ? 1 : 0,
    carpetCleaning: form.carpetCleaning,
    materialsAdditional: false,
  });
}

interface Props {
  onBack: () => void;
  hidePricing?: boolean;
  skipDeposit?: boolean;
}

export function RealEstateForm({ onBack, hidePricing = false, skipDeposit = false }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Signing state
  const [signingEmbedSrc, setSigningEmbedSrc] = useState("");
  const [signingLoading, setSigningLoading] = useState(false);
  const [docusealSubmissionId, setDocusealSubmissionId] = useState<number | null>(null);
  const [projectSubmitted, setProjectSubmitted] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Payment state
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutDepositCents, setCheckoutDepositCents] = useState(0);
  const [checkoutPhase, setCheckoutPhase] = useState<"loading" | "ready" | "test" | "error">("loading");

  const stepLabels = skipDeposit ? NO_DEPOSIT_STEP_LABELS : ALL_STEP_LABELS;

  function patch(updates: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  function validateStep(s: number): string {
    if (s === 1) {
      if (!form.agentName.trim()) return "Your name is required.";
      if (!form.agentEmail.trim()) return "Your email is required.";
    }
    if (s === 2) {
      if (!form.address.trim()) return "Property address is required.";
      if (!form.propertyType) return "Please select a property type.";
    }
    return "";
  }

  async function handleNext() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError("");

    if (step === 3) {
      // Fetch DocuSeal embed URL before advancing to signing step
      setSigningLoading(true);
      const pricing = computePricing(form);
      try {
        const res = await fetch("/api/real-estate-signing-embed", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agentName: form.agentName.trim(),
            agentEmail: form.agentEmail.trim(),
            agentPhone: form.agentPhone.trim() || undefined,
            address: form.address.trim(),
            fullClean: form.fullClean,
            touchUpPaint: form.touchUpPaint,
            fullPaint: form.fullPaint,
            carpetCleaning: form.carpetCleaning,
            priceCents: pricing.priceCents,
            cleanDate: form.cleanDate || undefined,
            depositNA: skipDeposit || undefined,
          }),
        });
        const data = await res.json().catch(() => ({})) as { embedSrc?: string; submissionId?: number; error?: string };
        if (!res.ok || !data.embedSrc) {
          setError(data.error || "Could not load contract. Please try again.");
          setSigningLoading(false);
          return;
        }
        setSigningEmbedSrc(data.embedSrc);
        setDocusealSubmissionId(data.submissionId ?? null);
        setStep(4);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setSigningLoading(false);
      }
      return;
    }

    setStep((s) => s + 1);
  }

  function handleBack() {
    setError("");
    if (step === 1) { onBack(); return; }
    if (step === 4) {
      // Clear signing state so a fresh embed is created if they go forward again
      setSigningEmbedSrc("");
      setDocusealSubmissionId(null);
    }
    setStep((s) => s - 1);
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);

    const pricing = computePricing(form);
    const jobTitle = `Real Estate - ${form.address.trim()}`;
    const description = [
      `Property: ${form.address.trim()}`,
      form.propertyType ? `Type: ${form.propertyType}` : null,
      form.bedrooms ? `Bedrooms: ${form.bedrooms}` : null,
      form.bathrooms ? `Bathrooms: ${form.bathrooms}` : null,
      form.squareFootage.trim() ? `Square Footage: ${form.squareFootage.trim()} sq ft` : null,
      `Furnished: ${form.furnished ? "Yes" : "No"}`,
      `Agent: ${form.agentName.trim()}`,
      form.agentEmail.trim() ? `Agent Email: ${form.agentEmail.trim()}` : null,
      form.agentPhone.trim() ? `Agent Phone: ${form.agentPhone.trim()}` : null,
      form.cleanDate ? `Clean Date: ${form.cleanDate}` : null,
      form.moveInDate ? `Move-in Date: ${form.moveInDate}` : null,
      form.comments.trim() ? `Notes: ${form.comments.trim()}` : null,
      pricing.services.filter((s) => s !== "No services selected").length > 0
        ? `Services: ${pricing.services.join(", ")}` : null,
      pricing.priceCents > 0 ? `Estimated Price: ${pricing.priceLabel}` : null,
      docusealSubmissionId ? `DocuSeal Submission ID: ${docusealSubmissionId}` : null,
    ].filter(Boolean).join("\n");

    const bedroomValue = form.bedrooms === "Studio" ? 0 : form.bedrooms === "4+" ? 4 : Number(form.bedrooms) || undefined;
    const bathroomValue = form.bathrooms === "3+" ? 3 : Number(form.bathrooms) || undefined;

    const payload = {
      segment: "REAL_ESTATE",
      jobTitle,
      description,
      buildingAddress: form.address.trim(),
      propertyType: form.propertyType || undefined,
      bedrooms: bedroomValue,
      bathrooms: bathroomValue,
      squareFootage: form.squareFootage.trim() ? Number(form.squareFootage.trim()) || undefined : undefined,
      furnished: form.furnished,
      fullClean: form.fullClean,
      touchUpPaint: form.touchUpPaint,
      fullPaint: form.fullPaint,
      carpetCleaning: form.carpetCleaning,
      projectDate: form.cleanDate || undefined,
      agentName: form.agentName.trim() || undefined,
      agentEmail: form.agentEmail.trim() || undefined,
      agentPhone: form.agentPhone.trim() || undefined,
      source: "external-real-estate",
      contractValue: pricing.priceCents > 0 ? pricing.priceCents / 100 : undefined,
      docusealSubmissionId: docusealSubmissionId ?? undefined,
    };

    try {
      // Submit project (only once — guard against re-submission if agent navigates back)
      if (!projectSubmitted) {
        const res = await fetch("/api/real-estate-projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({})) as { id?: string; projectId?: string; error?: string };
        if (!res.ok) { setError(data.error || "Submission failed. Please try again."); setLoading(false); return; }
        setProjectSubmitted(true);
        setProjectId(data.projectId ?? data.id ?? null);
      }

      // Skip deposit entirely for no-deposit flows
      if (skipDeposit) {
        setSubmitted(true);
        setLoading(false);
        return;
      }

      // Set up Stripe checkout for the deposit
      setCheckoutPhase("loading");
      const checkoutRes = await fetch("/api/real-estate-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentEmail: form.agentEmail.trim(),
          agentName: form.agentName.trim(),
          address: form.address.trim(),
          priceCents: pricing.priceCents,
          projectId: projectId ?? undefined,
        }),
      });
      const checkoutData = await checkoutRes.json().catch(() => ({})) as {
        clientSecret?: string;
        depositCents?: number;
        testMode?: boolean;
        error?: string;
      };

      if (checkoutData.testMode) {
        setCheckoutDepositCents(checkoutData.depositCents ?? 0);
        setCheckoutPhase("test");
      } else if (!checkoutRes.ok || !checkoutData.clientSecret) {
        setCheckoutPhase("error");
        setError(checkoutData.error || "Payment setup failed. Please try again.");
        setLoading(false);
        return;
      } else {
        setCheckoutClientSecret(checkoutData.clientSecret);
        setCheckoutDepositCents(checkoutData.depositCents ?? 0);
        setCheckoutPhase("ready");
      }

      setStep(5);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-6 rounded-xl border border-green-200 bg-green-50 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-7 w-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <div>
          <p className="text-lg font-semibold text-green-900">Signed & submitted!</p>
          <p className="mt-2 max-w-sm text-sm text-green-700">
            Your agreement has been signed and your request sent to Sueep. We&apos;ll be in touch shortly.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setForm(initial); setStep(1); setSubmitted(false); setSigningEmbedSrc(""); setDocusealSubmissionId(null); }}
          className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <StepIndicator current={step} stepLabels={stepLabels} />

      <div className="mt-6 space-y-5">
        {/* Step 1 — Your Info */}
        {step === 1 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="re-agent-name">Your name *</label>
                <input
                  id="re-agent-name"
                  className={input}
                  value={form.agentName}
                  onChange={(e) => patch({ agentName: e.target.value })}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className={label} htmlFor="re-agent-email">Your email *</label>
                <input
                  id="re-agent-email"
                  type="email"
                  className={input}
                  value={form.agentEmail}
                  onChange={(e) => patch({ agentEmail: e.target.value })}
                  placeholder="jane@realty.com"
                />
              </div>
              <div>
                <label className={label} htmlFor="re-agent-phone">Your phone</label>
                <input
                  id="re-agent-phone"
                  type="tel"
                  className={input}
                  value={form.agentPhone}
                  onChange={(e) => patch({ agentPhone: e.target.value })}
                  placeholder="(215) 555-0100"
                />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="re-comments">Additional notes</label>
              <textarea
                id="re-comments"
                rows={3}
                className={input}
                value={form.comments}
                onChange={(e) => patch({ comments: e.target.value })}
                placeholder="Access instructions, special requirements, or anything else we should know"
              />
            </div>
          </>
        )}

        {/* Step 2 — Property Info */}
        {step === 2 && (
          <>
            <div>
              <label className={label} htmlFor="re-address">Property address *</label>
              <input
                id="re-address"
                className={input}
                value={form.address}
                onChange={(e) => patch({ address: e.target.value })}
                placeholder="e.g. 123 Main St, Philadelphia, PA 19103"
              />
            </div>
            <div>
              <label className={label} htmlFor="re-type">Property type *</label>
              <select
                id="re-type"
                className={input}
                value={form.propertyType}
                onChange={(e) => patch({ propertyType: e.target.value })}
              >
                <option value="">Select a type...</option>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="re-beds">Bedrooms</label>
                <select
                  id="re-beds"
                  className={input}
                  value={form.bedrooms}
                  onChange={(e) => patch({ bedrooms: e.target.value })}
                >
                  <option value="">Select...</option>
                  {BEDROOM_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="re-baths">Bathrooms</label>
                <select
                  id="re-baths"
                  className={input}
                  value={form.bathrooms}
                  onChange={(e) => patch({ bathrooms: e.target.value })}
                >
                  <option value="">Select...</option>
                  {BATHROOM_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="re-sqft">Square footage</label>
                <input
                  id="re-sqft"
                  type="number"
                  min="0"
                  className={input}
                  value={form.squareFootage}
                  onChange={(e) => patch({ squareFootage: e.target.value })}
                  placeholder="e.g. 950"
                />
              </div>
              <div>
                <p className={label}>Furnished?</p>
                <div className="mt-1 flex gap-3">
                  {(["No", "Yes"] as const).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="re-furnished"
                        checked={form.furnished === (opt === "Yes")}
                        onChange={() => patch({ furnished: opt === "Yes" })}
                        className="accent-[#E73C6E]"
                      />
                      <span className="text-sm text-gray-700">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Step 3 — Services */}
        {step === 3 && (() => {
          const livePricing = computePricing(form);
          const lineItems = livePricing.breakdown.filter((l) => !l.startsWith("No ")).map((line) => {
            const match = line.match(/^(.+?):\s+(\$.+)$/);
            return match ? { label: match[1], price: match[2] } : null;
          }).filter(Boolean) as { label: string; price: string }[];

          return (
            <div className={`flex flex-col gap-5 ${!hidePricing ? "lg:flex-row lg:items-start" : ""}`}>
              {/* Left — inputs */}
              <div className="flex-1 space-y-5">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Services needed</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ServiceCheckbox checked={form.fullClean} onChange={(v) => patch({ fullClean: v })} label="Full clean" />
                    <ServiceCheckbox
                      checked={form.fullPaint}
                      disabled={form.touchUpPaint}
                      onChange={(v) => patch({ fullPaint: v, ...(v && { touchUpPaint: false }) })}
                      label="Full paint"
                    />
                    <ServiceCheckbox
                      checked={form.touchUpPaint}
                      disabled={form.fullPaint}
                      onChange={(v) => patch({ touchUpPaint: v, ...(v && { fullPaint: false }) })}
                      label="Paint touch-up"
                    />
                    <ServiceCheckbox checked={form.carpetCleaning} onChange={(v) => patch({ carpetCleaning: v })} label="Carpet cleaning" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="re-clean-date">Target clean date</label>
                    <input id="re-clean-date" type="date" className={input} value={form.cleanDate} onChange={(e) => patch({ cleanDate: e.target.value })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="re-movein-date">Move-in / listing date</label>
                    <input id="re-movein-date" type="date" className={input} value={form.moveInDate} onChange={(e) => patch({ moveInDate: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Right — order summary (hidden when hidePricing) */}
              {!hidePricing && <div className="w-full lg:w-64 lg:shrink-0">
                <div className="sticky top-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">Order summary</p>
                  </div>
                  <div className="px-4 py-3">
                    {lineItems.length === 0 ? (
                      <p className="py-2 text-xs italic text-gray-400">Select services to see pricing.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {lineItems.map((item) => (
                          <div key={item.label} className="flex justify-between">
                            <span className="text-xs text-gray-500">{item.label}</span>
                            <span className="text-xs tabular-nums text-gray-600">{item.price}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
                    <span className="text-sm font-semibold text-gray-700">Estimated total</span>
                    <span className="text-lg font-bold tabular-nums text-gray-900">
                      {livePricing.priceCents > 0 ? livePricing.priceLabel : "—"}
                    </span>
                  </div>
                </div>
              </div>}
            </div>
          );
        })()}

        {/* Step 4 — Sign Contract */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-sm font-medium text-blue-900">Almost done — please sign the service agreement below.</p>
              <p className="mt-1 text-xs text-blue-700">
                Your request will be submitted automatically once you sign. Sueep will countersign and send you a copy.
              </p>
            </div>
            <DocusealForm
              src={signingEmbedSrc}
              email={form.agentEmail}
              withTitle={false}
              onComplete={() => { void handleSubmit(); }}
              className="w-full"
            />
          </div>
        )}

        {/* Step 5 — Pay Deposit */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-pink-100 bg-pink-50 px-4 py-3">
              <p className="text-sm font-medium text-pink-900">Last step — pay your 50% deposit to confirm.</p>
              <p className="mt-1 text-xs text-pink-700">
                Your contract is signed and your request is submitted.
                {checkoutDepositCents > 0 && (
                  <span className="ml-1 font-semibold">
                    Due now:{" "}
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(checkoutDepositCents / 100)}
                  </span>
                )}
              </p>
            </div>

            {checkoutPhase === "loading" && (
              <div className="flex min-h-[200px] items-center justify-center rounded-md border border-dashed border-gray-200 bg-gray-50 text-xs text-gray-500">
                Preparing secure checkout…
              </div>
            )}

            {checkoutPhase === "test" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <p className="font-semibold">Test mode — Stripe not configured</p>
                <p className="mt-1">Add <code className="rounded bg-amber-100 px-1">STRIPE_SECRET_KEY</code> to .env.local for real payments.</p>
                <a
                  href="/real-estate-thank-you?status=ok&deposit=simulated"
                  className="mt-3 inline-block rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  Simulate deposit →
                </a>
              </div>
            )}

            {checkoutPhase === "ready" && checkoutClientSecret && (
              <div className="min-h-[300px]">
                <EmbeddedCheckoutProvider
                  key={checkoutClientSecret}
                  stripe={paintingStripePromise}
                  options={{ clientSecret: checkoutClientSecret }}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {/* Navigation — hidden on steps 4 and 5 */}
      {step < 4 && (
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={() => { void handleNext(); }}
              className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={signingLoading}
              onClick={() => { void handleNext(); }}
              className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {signingLoading ? "Loading contract…" : "Review & Sign"}
            </button>
          )}
        </div>
      )}
      {step === 4 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      )}
      {loading && (
        <p className="mt-3 text-xs text-gray-500">
          {projectSubmitted ? "Setting up payment…" : "Submitting your request…"}
        </p>
      )}
    </div>
  );
}
