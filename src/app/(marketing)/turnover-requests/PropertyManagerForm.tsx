"use client";

import { useState } from "react";
import { DocusealForm } from "@docuseal/react";
import { computeTurnoverPricing } from "@/lib/turnoverPricing";
import { getTurnoverPricingPackage } from "@/lib/turnoverPricingPackages";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const label = "block text-xs font-medium text-gray-600";

const UNIT_FEATURE_OPTIONS = [
  { value: "studio", label: "Studio" },
  { value: "1/1", label: "1 bed / 1 bath" },
  { value: "2/1", label: "2 bed / 1 bath" },
  { value: "2/2", label: "2 bed / 2 bath" },
  { value: "3/1", label: "3 bed / 1 bath" },
  { value: "3/2", label: "3 bed / 2 bath" },
  { value: "3/3", label: "3 bed / 3 bath" },
  { value: "common-area", label: "Common Area" },
] as const;

type UnitFeatureValue = (typeof UNIT_FEATURE_OPTIONS)[number]["value"];

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Building", "Unit & Services", "Your Info", "Sign Contract"] as const;

export interface BuildingOption {
  id: string;
  name: string;
  address: string;
  pmName?: string | null;
  pmEmail?: string | null;
  pmPhone?: string | null;
  pricingPackage?: unknown;
}

interface FormState {
  buildingId: string;
  unitNumber: string;
  features: UnitFeatureValue;
  fullClean: boolean;
  touchUpPaint: boolean;
  fullPaint: boolean;
  carpetCleaning: boolean;
  otherWork: boolean;
  otherDescription: string;
  otherPrice: string;
  startDate: string;
  endDate: string;
  pmName: string;
  pmEmail: string;
  pmPhone: string;
}

const initial: FormState = {
  buildingId: "",
  unitNumber: "",
  features: "1/1",
  fullClean: false,
  touchUpPaint: false,
  fullPaint: false,
  carpetCleaning: false,
  otherWork: false,
  otherDescription: "",
  otherPrice: "",
  startDate: "",
  endDate: "",
  pmName: "",
  pmEmail: "",
  pmPhone: "",
};

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-gray-100 pb-4">
      {STEP_LABELS.map((stepLabel, i) => {
        const s = i + 1;
        const done = s < current;
        const active = s === current;
        return (
          <div key={s} className="flex items-center gap-1.5">
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-[#E73C6E] text-white"
                  : active
                  ? "bg-[#E73C6E] text-white ring-2 ring-pink-200"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {done ? "✓" : s}
            </div>
            {active && <span className="text-xs font-medium text-[#E73C6E]">{stepLabel}</span>}
            {s < TOTAL_STEPS && (
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
    <label
      className={`flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 cursor-pointer transition hover:border-pink-200 ${
        disabled ? "opacity-50 cursor-default" : ""
      }`}
    >
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

function dollarsToCents(value: string): number {
  const normalized = value.replace(/[$,\s]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function parseFeaturesForPricing(features: UnitFeatureValue): { bedrooms?: number; bathrooms?: number } {
  if (features === "studio") return { bedrooms: 0, bathrooms: 1 };
  if (features === "common-area") return {};
  const [beds, baths] = features.split("/").map(Number);
  return { bedrooms: beds || undefined, bathrooms: baths || undefined };
}

interface Props {
  onBack: () => void;
  buildings: BuildingOption[];
}

export function PropertyManagerForm({ onBack, buildings }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [signingEmbedSrc, setSigningEmbedSrc] = useState("");
  const [signingLoading, setSigningLoading] = useState(false);
  const [signingSubmissionId, setSigningSubmissionId] = useState<number | null>(null);

  const selectedBuilding = buildings.find((b) => b.id === form.buildingId) ?? null;

  function patch(updates: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  function handleBuildingChange(id: string) {
    const building = buildings.find((b) => b.id === id);
    patch({
      buildingId: id,
      pmName: building?.pmName ?? "",
      pmEmail: building?.pmEmail ?? "",
      pmPhone: building?.pmPhone ?? "",
    });
  }

  function validateStep(s: number): string {
    if (s === 1 && !form.buildingId) return "Please select a building.";
    if (s === 2 && form.otherWork) {
      if (!form.otherDescription.trim()) return "Please describe the other work needed.";
      if (!form.otherPrice.trim() || Number(form.otherPrice) <= 0) return "Please enter a price for the other work.";
    }
    if (s === 3) {
      if (!form.pmName.trim()) return "Your name is required.";
      if (!form.pmEmail.trim()) return "Your email is required.";
    }
    return "";
  }

  function handleBack() {
    setError("");
    if (step === 1) { onBack(); return; }
    if (step === 4) {
      setSigningEmbedSrc("");
      setStep(3);
      return;
    }
    setStep((s) => s - 1);
  }

  async function handleNext() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => s + 1);
  }

  async function handleSubmit() {
    const err = validateStep(3);
    if (err) { setError(err); return; }
    setError("");
    setSigningLoading(true);

    const pricingPackage = getTurnoverPricingPackage(selectedBuilding?.name ?? "");
    const { bedrooms, bathrooms } = parseFeaturesForPricing(form.features);
    const isCommonArea = form.features === "common-area";
    const pricing = computeTurnoverPricing({
      requestType: "TURNOVER",
      pricingPackage,
      bedrooms,
      bathrooms,
      isCommonArea,
      fullClean: form.fullClean,
      fullPaint: form.fullPaint,
      touchUpPaint: form.touchUpPaint ? 1 : 0,
      carpetCleaning: form.carpetCleaning,
      materialsAdditional: false,
      ceilingPaint: false,
    });
    const otherCents = form.otherWork ? dollarsToCents(form.otherPrice) : 0;
    const totalPriceCents = pricing.priceCents + otherCents;

    try {
      const signingRes = await fetch("/api/real-estate-signing-embed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentName: form.pmName.trim(),
          agentEmail: form.pmEmail.trim(),
          address: selectedBuilding?.address ?? "",
          fullClean: form.fullClean,
          touchUpPaint: form.touchUpPaint,
          fullPaint: form.fullPaint,
          carpetCleaning: form.carpetCleaning,
          otherWork: form.otherWork,
          otherDescription: form.otherWork ? form.otherDescription.trim() : undefined,
          priceCents: totalPriceCents,
          cleanDate: form.startDate || undefined,
          depositNA: true,
          isPropertyManager: true,
        }),
      });
      const signingData = (await signingRes.json().catch(() => ({}))) as { embedSrc?: string; submissionId?: number; error?: string };
      if (!signingRes.ok || !signingData.embedSrc) {
        setError(signingData.error || "Could not load contract. Please try again.");
        return;
      }
      setSigningEmbedSrc(signingData.embedSrc);
      setSigningSubmissionId(signingData.submissionId ?? null);
      setStep(4);
    } catch {
      setError("Network error loading contract. Please try again.");
    } finally {
      setSigningLoading(false);
    }
  }

  async function handleSigningComplete() {
    // Submit the project only after the contract is signed
    try {
      const res = await fetch("/api/janitorial-turnover-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buildingId: form.buildingId,
          unitScopes: [
            {
              unitNumber: form.unitNumber.trim() || "Unit TBD",
              features: form.features,
              fullClean: form.fullClean,
              touchUpPaint: form.touchUpPaint,
              fullPaint: form.fullPaint,
              carpetCleaning: form.carpetCleaning,
              otherWork: form.otherWork,
              otherDescription: form.otherWork ? form.otherDescription.trim() : undefined,
              otherPrice: form.otherWork ? form.otherPrice : undefined,
              startDate: form.startDate || undefined,
              endDate: form.endDate || undefined,
            },
          ],
          pmName: form.pmName.trim(),
          pmEmail: form.pmEmail.trim(),
          pmPhone: form.pmPhone.trim() || undefined,
          sueepPmName: "David Rodriguez",
          sueepPmEmail: "david@sueep.com",
          source: "external",
          docusealSubmissionId: signingSubmissionId ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Submission failed. Please contact Sueep directly.");
      }
    } catch {
      setError("Network error. Please contact Sueep directly.");
    }
    setSubmitted(true);
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
          onClick={() => { setForm(initial); setStep(1); setSubmitted(false); }}
          className="rounded-md border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <StepIndicator current={step} />

      <div className="mt-6 space-y-5">
        {/* Step 1 — Building */}
        {step === 1 && (
          <>
            <div>
              <label className={label} htmlFor="pm-building">
                Property / Building *
              </label>
              <select
                id="pm-building"
                className={input}
                value={form.buildingId}
                onChange={(e) => handleBuildingChange(e.target.value)}
              >
                <option value="">Select a building…</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedBuilding && (
              <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-sm font-medium text-gray-800">{selectedBuilding.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">{selectedBuilding.address}</p>
              </div>
            )}
          </>
        )}

        {/* Step 2 — Unit & Services */}
        {step === 2 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="pm-unit">
                  Unit number
                </label>
                <input
                  id="pm-unit"
                  className={input}
                  value={form.unitNumber}
                  onChange={(e) => patch({ unitNumber: e.target.value })}
                  placeholder="e.g. 4B"
                />
              </div>
              <div>
                <label className={label} htmlFor="pm-features">
                  Unit layout
                </label>
                <select
                  id="pm-features"
                  className={input}
                  value={form.features}
                  onChange={(e) => patch({ features: e.target.value as UnitFeatureValue })}
                >
                  {UNIT_FEATURE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Services needed
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <ServiceCheckbox
                  checked={form.fullClean}
                  onChange={(v) => patch({ fullClean: v })}
                  label="Full clean"
                />
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
                <ServiceCheckbox
                  checked={form.carpetCleaning}
                  onChange={(v) => patch({ carpetCleaning: v })}
                  label="Carpet cleaning"
                />
                <ServiceCheckbox
                  checked={form.otherWork}
                  onChange={(v) => patch({ otherWork: v, ...(!v && { otherDescription: "", otherPrice: "" }) })}
                  label="Other"
                />
              </div>
              {form.otherWork && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="pm-other-description">
                      Describe the work *
                    </label>
                    <input
                      id="pm-other-description"
                      className={input}
                      value={form.otherDescription}
                      onChange={(e) => patch({ otherDescription: e.target.value })}
                      placeholder="e.g. Window cleaning"
                    />
                  </div>
                  <div>
                    <label className={label} htmlFor="pm-other-price">
                      Price ($) *
                    </label>
                    <input
                      id="pm-other-price"
                      type="number"
                      min={0}
                      step="0.01"
                      className={input}
                      value={form.otherPrice}
                      onChange={(e) => patch({ otherPrice: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="pm-start">
                  Target start date
                </label>
                <input
                  id="pm-start"
                  type="date"
                  className={input}
                  value={form.startDate}
                  onChange={(e) => patch({ startDate: e.target.value })}
                />
              </div>
              <div>
                <label className={label} htmlFor="pm-end">
                  Target end / move-in date
                </label>
                <input
                  id="pm-end"
                  type="date"
                  className={input}
                  value={form.endDate}
                  onChange={(e) => patch({ endDate: e.target.value })}
                />
              </div>
            </div>
          </>
        )}

        {/* Step 4 — Sign Contract */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-sm font-medium text-blue-900">Almost done — please sign the service agreement below.</p>
              <p className="mt-1 text-xs text-blue-700">
                Sueep will countersign and send you a copy once your request is confirmed.
              </p>
            </div>
            <DocusealForm
              src={signingEmbedSrc}
              email={form.pmEmail}
              withTitle={false}
              onComplete={() => { void handleSigningComplete(); }}
              className="w-full"
            />
          </div>
        )}

        {/* Step 3 — Your Info */}
        {step === 3 && (
          <>
            {(selectedBuilding?.pmName || selectedBuilding?.pmEmail) && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                We pre-filled your info from the building record. Please confirm or update before submitting.
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="pm-name">
                  Your name *
                </label>
                <input
                  id="pm-name"
                  className={input}
                  value={form.pmName}
                  onChange={(e) => patch({ pmName: e.target.value })}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className={label} htmlFor="pm-email">
                  Your email *
                </label>
                <input
                  id="pm-email"
                  type="email"
                  className={input}
                  value={form.pmEmail}
                  onChange={(e) => patch({ pmEmail: e.target.value })}
                  placeholder="jane@propertyco.com"
                />
              </div>
              <div>
                <label className={label} htmlFor="pm-phone">
                  Your phone
                </label>
                <input
                  id="pm-phone"
                  type="tel"
                  className={input}
                  value={form.pmPhone}
                  onChange={(e) => patch({ pmPhone: e.target.value })}
                  placeholder="(215) 555-0100"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

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
              disabled={loading || signingLoading}
              onClick={() => { void handleSubmit(); }}
              className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Submitting…" : signingLoading ? "Loading contract…" : "Review & Sign"}
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
    </div>
  );
}
