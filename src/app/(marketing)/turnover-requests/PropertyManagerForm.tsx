"use client";

import { useState } from "react";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const label = "block text-xs font-medium text-gray-600";

const BEDROOM_OPTIONS = ["Studio", "1", "2", "3", "4+"] as const;
const BATHROOM_OPTIONS = ["1", "2", "3+"] as const;
const UNIT_QUALITY_OPTIONS = [
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
] as const;

type BedroomValue = (typeof BEDROOM_OPTIONS)[number];
type BathroomValue = (typeof BATHROOM_OPTIONS)[number];

const TOTAL_STEPS = 3;
const STEP_LABELS = ["Building", "Unit & Services", "Your Info"] as const;

export interface BuildingOption {
  id: string;
  name: string;
  address: string;
}

interface FormState {
  buildingId: string;
  unitNumber: string;
  bedrooms: BedroomValue;
  bathrooms: BathroomValue;
  isCommonArea: boolean;
  sqft: string;
  unitQuality: string;
  fullClean: boolean;
  touchUpPaint: boolean;
  fullPaint: boolean;
  carpetCleaning: boolean;
  otherWork: boolean;
  otherDescription: string;
  startDate: string;
  endDate: string;
  notes: string;
  pmName: string;
  pmEmail: string;
  pmPhone: string;
  /** Hidden from people; only bots fill it in */
  website: string;
}

const initial: FormState = {
  buildingId: "",
  unitNumber: "",
  bedrooms: "1",
  bathrooms: "1",
  isCommonArea: false,
  sqft: "",
  unitQuality: "",
  fullClean: false,
  touchUpPaint: false,
  fullPaint: false,
  carpetCleaning: false,
  otherWork: false,
  otherDescription: "",
  startDate: "",
  endDate: "",
  notes: "",
  pmName: "",
  pmEmail: "",
  pmPhone: "",
  website: "",
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

function bedroomsToNumber(value: BedroomValue): number {
  if (value === "Studio") return 0;
  if (value === "4+") return 4;
  return Number(value) || 1;
}

function bathroomsToNumber(value: BathroomValue): number {
  if (value === "3+") return 3;
  return Number(value) || 1;
}

interface Props {
  onBack: () => void;
  buildings: BuildingOption[];
}

export function PropertyManagerForm({ onBack, buildings }: Props) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const selectedBuilding = buildings.find((b) => b.id === form.buildingId) ?? null;

  function patch(updates: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  function validateStep(s: number): string {
    if (s === 1 && !form.buildingId) return "Please select a building.";
    if (s === 2) {
      if (!form.isCommonArea && !form.unitNumber.trim()) return "Please enter the unit number.";
      if (!form.fullClean && !form.fullPaint && !form.touchUpPaint && !form.carpetCleaning && !form.otherWork) {
        return "Please pick at least one service.";
      }
      if (!form.startDate) return "Target start date is required.";
      if (form.otherWork && !form.otherDescription.trim()) return "Please describe the other work needed.";
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
    setStep((s) => s - 1);
  }

  function handleNext() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError("");
    setStep((s) => s + 1);
  }

  async function handleSubmit() {
    const err = validateStep(3);
    if (err) { setError(err); return; }
    setError("");
    setSending(true);
    try {
      // Prices are worked out by Sueep from the building's pricing package, so none are sent.
      const res = await fetch("/api/website-turnover-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          buildingId: form.buildingId,
          unitNumber: form.unitNumber.trim(),
          isCommonArea: form.isCommonArea,
          bedrooms: bedroomsToNumber(form.bedrooms),
          bathrooms: bathroomsToNumber(form.bathrooms),
          sqft: form.sqft || undefined,
          unitQuality: form.unitQuality || undefined,
          fullClean: form.fullClean,
          touchUpPaint: form.touchUpPaint,
          fullPaint: form.fullPaint,
          carpetCleaning: form.carpetCleaning,
          otherWork: form.otherWork,
          otherDescription: form.otherWork ? form.otherDescription.trim() : undefined,
          startDate: form.startDate,
          endDate: form.endDate || undefined,
          notes: form.notes.trim() || undefined,
          name: form.pmName.trim(),
          email: form.pmEmail.trim(),
          phone: form.pmPhone.trim() || undefined,
          website: form.website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Submission failed. Please contact Sueep directly.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please contact Sueep directly.");
    } finally {
      setSending(false);
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
          <p className="text-lg font-semibold text-green-900">Request sent!</p>
          <p className="mt-2 max-w-sm text-sm text-green-700">
            Sueep will review it and email you to confirm the date and price.
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
                onChange={(e) => patch({ buildingId: e.target.value })}
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
                  Unit number{form.isCommonArea ? "" : " *"}
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
                <label className={label} htmlFor="pm-sqft">
                  Square footage
                </label>
                <input
                  id="pm-sqft"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  className={input}
                  value={form.sqft}
                  onChange={(e) => patch({ sqft: e.target.value })}
                  placeholder="e.g. 850"
                />
              </div>
              <div>
                <label className={label} htmlFor="pm-bedrooms">
                  Bedrooms
                </label>
                <select
                  id="pm-bedrooms"
                  className={input}
                  value={form.bedrooms}
                  disabled={form.isCommonArea}
                  onChange={(e) => patch({ bedrooms: e.target.value as BedroomValue })}
                >
                  {BEDROOM_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="pm-bathrooms">
                  Bathrooms
                </label>
                <select
                  id="pm-bathrooms"
                  className={input}
                  value={form.bathrooms}
                  disabled={form.isCommonArea}
                  onChange={(e) => patch({ bathrooms: e.target.value as BathroomValue })}
                >
                  {BATHROOM_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="pm-quality">
                  Unit quality
                </label>
                <select
                  id="pm-quality"
                  className={input}
                  value={form.unitQuality}
                  onChange={(e) => patch({ unitQuality: e.target.value })}
                >
                  <option value="">Select quality...</option>
                  {UNIT_QUALITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={form.isCommonArea}
                    onChange={(e) => patch({ isCommonArea: e.target.checked })}
                    className="h-4 w-4 rounded accent-[#E73C6E]"
                  />
                  <span className="ml-2 text-sm text-gray-700">Common area</span>
                </label>
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
                  onChange={(v) => patch({ otherWork: v, ...(!v && { otherDescription: "" }) })}
                  label="Other"
                />
              </div>
              {form.otherWork && (
                <div className="mt-3">
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
                  <p className="mt-1 text-xs text-gray-500">Sueep will price this when confirming your request.</p>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="pm-start">
                  Target start date *
                </label>
                <input
                  id="pm-start"
                  type="date"
                  required
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

            <div>
              <label className={label} htmlFor="pm-notes">
                Notes
              </label>
              <textarea
                id="pm-notes"
                rows={2}
                className={input}
                value={form.notes}
                onChange={(e) => patch({ notes: e.target.value })}
                placeholder="Access, lockbox code, anything we should know"
              />
            </div>
          </>
        )}

        {/* Step 3 — Your Info */}
        {step === 3 && (
          <>
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
            {/* Spam trap: hidden from people, so anything typed here came from a bot. */}
            <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="pm-website">Website</label>
              <input
                id="pm-website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(e) => patch({ website: e.target.value })}
              />
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

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
            onClick={handleNext}
            className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            disabled={sending}
            onClick={() => { void handleSubmit(); }}
            className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Submit request"}
          </button>
        )}
      </div>
    </div>
  );
}
