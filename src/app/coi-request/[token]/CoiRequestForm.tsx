"use client";

import { useState } from "react";
import { InfoTip } from "@/app/erp/components/ui";

export type PreviousHolder = {
  name: string;
  address: string;
  reqGlOccurrence: string;
  reqGlAggregate: string;
  reqAuto: string;
  reqUmbrella: string;
  reqWc: string;
  requiresAdditionalInsured: boolean;
  requiresWaiverOfSubrogation: boolean;
  requiresPrimaryNoncontributory: boolean;
  additionalInsureds: string;
  specialWording: string;
};

const field =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const label = "block text-sm font-medium text-gray-700";
const card = "space-y-4 rounded-xl border border-gray-200 bg-white p-5";

export function CoiRequestForm({ token, projectTitle, previous }: { token: string; projectTitle: string | null; previous: PreviousHolder[] }) {
  const [holders, setHolders] = useState([{ name: "", address: "" }]);
  const [req, setReq] = useState({
    reqGlOccurrenceCents: "",
    reqGlAggregateCents: "",
    reqAutoCents: "",
    reqUmbrellaCents: "",
    reqWcEmployersLiabilityCents: "",
    requiresAdditionalInsured: false,
    requiresWaiverOfSubrogation: false,
    requiresPrimaryNoncontributory: false,
    additionalInsureds: "",
    specialWording: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function applyPrevious(p: PreviousHolder) {
    setHolders((hs) => {
      const blank = hs.findIndex((h) => !h.name.trim());
      const next = { name: p.name, address: p.address };
      return blank >= 0 ? hs.map((h, i) => (i === blank ? next : h)) : [...hs, next];
    });
    setReq((r) => ({
      reqGlOccurrenceCents: r.reqGlOccurrenceCents || p.reqGlOccurrence,
      reqGlAggregateCents: r.reqGlAggregateCents || p.reqGlAggregate,
      reqAutoCents: r.reqAutoCents || p.reqAuto,
      reqUmbrellaCents: r.reqUmbrellaCents || p.reqUmbrella,
      reqWcEmployersLiabilityCents: r.reqWcEmployersLiabilityCents || p.reqWc,
      requiresAdditionalInsured: r.requiresAdditionalInsured || p.requiresAdditionalInsured,
      requiresWaiverOfSubrogation: r.requiresWaiverOfSubrogation || p.requiresWaiverOfSubrogation,
      requiresPrimaryNoncontributory: r.requiresPrimaryNoncontributory || p.requiresPrimaryNoncontributory,
      additionalInsureds: r.additionalInsureds || p.additionalInsureds,
      specialWording: r.specialWording || p.specialWording,
    }));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await fetch(`/api/coi-request/${token}`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const header = (
    <div className="mb-8 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-[#E73C6E]">Sueep</p>
      <h1 className="mt-1 text-2xl font-bold text-gray-900">Request a Certificate of Insurance</h1>
      {projectTitle && <p className="mt-2 text-sm text-gray-500">{projectTitle}</p>}
    </div>
  );

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-xl">
          {header}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <p className="text-base font-semibold text-emerald-800">Request received</p>
            <p className="mt-1 text-sm text-emerald-700">We&apos;ll email the certificate to you. Need another one? Use this same link.</p>
          </div>
        </div>
      </div>
    );
  }

  const money = (key: keyof typeof req, text: string) => (
    <div>
      <label className={label} htmlFor={`r-${key}`}>{text}</label>
      <input
        id={`r-${key}`}
        name={key}
        inputMode="decimal"
        placeholder="$"
        value={req[key] as string}
        onChange={(e) => setReq((r) => ({ ...r, [key]: e.target.value }))}
        className={field}
      />
    </div>
  );
  const check = (key: "requiresAdditionalInsured" | "requiresWaiverOfSubrogation" | "requiresPrimaryNoncontributory", text: string) => (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" name={key} checked={req[key]} onChange={(e) => setReq((r) => ({ ...r, [key]: e.target.checked }))} className="h-4 w-4 accent-[#E73C6E]" />
      {text}
    </label>
  );

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-xl">
        {header}

        <form onSubmit={submit} className="space-y-5">
          {/* Bots fill this in; people never see it. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

          <section className={card}>
            <h2 className="text-base font-semibold text-gray-900">Your information</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="r-name">Name *</label>
                <input id="r-name" name="requesterName" required autoComplete="name" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="r-company">Company</label>
                <input id="r-company" name="requesterCompany" autoComplete="organization" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="r-email">Email *</label>
                <input id="r-email" name="requesterEmail" type="email" required autoComplete="email" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="r-phone">Phone</label>
                <input id="r-phone" name="requesterPhone" type="tel" autoComplete="tel" className={field} />
              </div>
              {!projectTitle && (
                <div className="sm:col-span-2">
                  <label className={label} htmlFor="r-project">Project or property *</label>
                  <input id="r-project" name="projectText" required placeholder="Name and address" className={field} />
                </div>
              )}
              <div>
                <label className={label} htmlFor="r-needed">Needed by</label>
                <input id="r-needed" name="neededBy" type="date" className={field} />
              </div>
            </div>
          </section>

          <section className={card}>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-semibold text-gray-900">Certificate holder</h2>
              <InfoTip text="The company named at the bottom of the certificate. Add more than one if you need a certificate for each." />
            </div>

            {previous.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">Used before:</span>
                {previous.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPrevious(p)}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:border-[#E73C6E] hover:text-[#E73C6E]"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {holders.map((h, i) => (
              <div key={i} className="space-y-3 rounded-lg bg-gray-50 p-3">
                <div>
                  <label className={label} htmlFor={`r-h-name-${i}`}>Name *</label>
                  <input
                    id={`r-h-name-${i}`}
                    name="holderName"
                    required={i === 0}
                    value={h.name}
                    onChange={(e) => setHolders((hs) => hs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    placeholder="Exactly as it should appear"
                    className={field}
                  />
                </div>
                <div>
                  <label className={label} htmlFor={`r-h-addr-${i}`}>Address</label>
                  <textarea
                    id={`r-h-addr-${i}`}
                    name="holderAddress"
                    rows={2}
                    value={h.address}
                    onChange={(e) => setHolders((hs) => hs.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))}
                    className={field}
                  />
                </div>
                {holders.length > 1 && (
                  <button type="button" onClick={() => setHolders((hs) => hs.filter((_, j) => j !== i))} className="text-xs text-gray-500 hover:text-red-600">
                    Remove
                  </button>
                )}
              </div>
            ))}
            {holders.length < 10 && (
              <button type="button" onClick={() => setHolders((hs) => [...hs, { name: "", address: "" }])} className="text-sm font-medium text-[#E73C6E] hover:underline">
                + Add another holder
              </button>
            )}
          </section>

          <section className={card}>
            <div className="flex items-center gap-1.5">
              <h2 className="text-base font-semibold text-gray-900">Requirements</h2>
              <InfoTip text="From your contract or vendor requirements. Leave blank anything you don't need." />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {money("reqGlOccurrenceCents", "General liability, each occurrence")}
              {money("reqGlAggregateCents", "General liability, aggregate")}
              {money("reqAutoCents", "Auto")}
              {money("reqUmbrellaCents", "Umbrella")}
              {money("reqWcEmployersLiabilityCents", "Employer's liability")}
            </div>
            <div className="space-y-2">
              {check("requiresAdditionalInsured", "Additional insured")}
              {check("requiresWaiverOfSubrogation", "Waiver of subrogation")}
              {check("requiresPrimaryNoncontributory", "Primary and noncontributory")}
            </div>
            <div>
              <label className={label} htmlFor="r-ai">Additional insured names</label>
              <textarea
                id="r-ai"
                name="additionalInsureds"
                rows={2}
                value={req.additionalInsureds}
                onChange={(e) => setReq((r) => ({ ...r, additionalInsureds: e.target.value }))}
                placeholder="One per line"
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="r-wording">Special wording</label>
              <textarea
                id="r-wording"
                name="specialWording"
                rows={3}
                value={req.specialWording}
                onChange={(e) => setReq((r) => ({ ...r, specialWording: e.target.value }))}
                placeholder="Language for the Description of Operations box"
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="r-sample">Sample certificate or requirements</label>
              <input
                id="r-sample"
                name="sample"
                type="file"
                accept="application/pdf,image/*"
                className="mt-1 block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
              />
            </div>
            <div>
              <label className={label} htmlFor="r-notes">Anything else</label>
              <textarea id="r-notes" name="notes" rows={2} className={field} />
            </div>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#E73C6E] px-4 py-3 text-sm font-semibold text-white hover:bg-[#d13460] disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send request"}
          </button>
        </form>
      </div>
    </div>
  );
}
