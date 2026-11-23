"use client";

import { useState } from "react";
import { Button, InfoTip, inputClass, labelClass } from "@/app/erp/components/ui";
import { usePricingSettings } from "@/app/components/PricingSettingsProvider";
import { clientChangeOrderPrice, deriveChangeOrderSupervisorCount, getChangeOrderLaborRates } from "@/lib/changeOrderLaborRates";
import { centsToDollars } from "@/lib/erp/money";
import { DEFAULT_PURCHASE_TERMS } from "@/lib/contracts/changeOrderTerms";
import type { ContractItem } from "./ChangeOrderSigningSection";

/** What the form starts with, from the change order and its project. */
export type CoContractPrefill = {
  coTitle: string;
  scope: string;
  startDateKey: string;
  endDateKey: string;
  /** The project's rate card, for pricing by rates (same as the request page) */
  laborRateCard: unknown;
  /** The change order's Contract value, in cents (null when not set yet) */
  totalCents: number | null;
  cleaners: number | null;
  foremen: number | null;
  days: number | null;
  clientCompany: string;
  clientAddress: string;
  /** Project contacts with an email, to pick who it goes to */
  contacts: { name: string; email: string }[];
};

/**
 * Create contract: for when the client didn't use the request link. Fills the
 * change order contract PDF from the change order, lets the PM preview it,
 * then emails it to the client to sign and send back.
 */
export function CreateCoContractForm({
  projectId,
  changeOrderId,
  prefill,
  onSent,
  onCancel,
}: {
  projectId: string;
  changeOrderId: string;
  prefill: CoContractPrefill;
  onSent: (contract: ContractItem, warning: string | null) => void;
  onCancel: () => void;
}) {
  const first = prefill.contacts[0];
  const [f, setF] = useState({
    coTitle: prefill.coTitle,
    scope: prefill.scope,
    startDateKey: prefill.startDateKey,
    endDateKey: prefill.endDateKey,
    price: prefill.totalCents ? (prefill.totalCents / 100).toFixed(2) : "",
    cleaners: prefill.cleaners ? String(prefill.cleaners) : "",
    foremen: prefill.foremen ? String(prefill.foremen) : "",
    days: prefill.days ? String(prefill.days) : "",
    clientCompany: prefill.clientCompany,
    clientAddress: prefill.clientAddress,
    recipientName: first?.name ?? "",
    recipientEmail: first?.email ?? "",
    message: "",
    purchaseTerms: DEFAULT_PURCHASE_TERMS,
  });
  // Start on Enter a price when the change order already has one, else on rates.
  const [mode, setMode] = useState<"rates" | "price" | "hourly">(prefill.totalCents ? "price" : "rates");
  const [foremenEdited, setForemenEdited] = useState(false);
  const pricing = usePricingSettings();
  // This project's rates (else the company's), editable for this contract only.
  const baseRates = getChangeOrderLaborRates(prefill.laborRateCard, pricing.coPriceRates);
  const [rateInputs, setRateInputs] = useState({
    cleaner: (baseRates.cleanerHourlyRateCents / 100).toFixed(2),
    foreman: (baseRates.foremanHourlyRateCents / 100).toFixed(2),
  });
  const rateCents = (v: string) => {
    const n = Math.round(Number(v.replace(/[$,\s]/g, "")) * 100);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // Hourly rate: no total, just the rate (foreman rate optional, blank = not shown).
  const [hourlyInputs, setHourlyInputs] = useState({ cleaner: (baseRates.cleanerHourlyRateCents / 100).toFixed(2), foreman: "" });
  const rates = {
    cleanerHourlyRateCents: rateCents(rateInputs.cleaner) ?? baseRates.cleanerHourlyRateCents,
    foremanHourlyRateCents: rateCents(rateInputs.foreman) ?? baseRates.foremanHourlyRateCents,
  };
  const ratesEdited =
    rates.cleanerHourlyRateCents !== baseRates.cleanerHourlyRateCents || rates.foremanHourlyRateCents !== baseRates.foremanHourlyRateCents;
  const cleanerCount = Math.max(0, Math.round(Number(f.cleaners) || 0));
  const foremenCount = foremenEdited && f.foremen !== "" ? Math.max(0, Math.round(Number(f.foremen) || 0)) : deriveChangeOrderSupervisorCount(cleanerCount);
  const ratePrice =
    mode === "rates" && cleanerCount > 0
      ? clientChangeOrderPrice(
          { cleanerCount, supervisorCount: foremenCount },
          rates,
          { startKey: f.startDateKey, endKey: f.endDateKey, coDayHours: pricing.coDayHours, nextDayPct: pricing.nextDayPct },
        )
      : null;
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  function body(action: "preview" | "send") {
    return JSON.stringify({
      action,
      mode,
      coTitle: f.coTitle,
      scope: f.scope,
      startDateKey: f.startDateKey,
      endDateKey: f.endDateKey,
      totalCents: mode === "price" ? Math.round(Number(f.price.replace(/[$,\s]/g, "")) * 100) : null,
      cleaners: f.cleaners || null,
      // By rates, foremen follow the cleaners unless someone changed the number.
      foremen: mode === "rates" ? foremenCount : f.foremen || null,
      days: mode === "rates" ? null : f.days || null,
      cleanerRateCents: mode === "rates" ? rates.cleanerHourlyRateCents : mode === "hourly" ? rateCents(hourlyInputs.cleaner) : null,
      foremanRateCents: mode === "rates" ? rates.foremanHourlyRateCents : mode === "hourly" ? rateCents(hourlyInputs.foreman) : null,
      clientCompany: f.clientCompany,
      clientAddress: f.clientAddress,
      recipientName: f.recipientName,
      recipientEmail: f.recipientEmail,
      message: f.message,
      purchaseTerms: f.purchaseTerms,
    });
  }
  const url = `/api/erp/projects/${projectId}/change-orders/${changeOrderId}/contract/create`;

  async function preview() {
    setBusy("preview");
    setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body("preview") });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Could not make the PDF.");
        return;
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank", "noopener");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!confirm(`Email this contract to ${f.recipientEmail || "the client"} to sign?`)) return;
    setBusy("send");
    setError("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body("send") });
      const d = (await res.json().catch(() => ({}))) as { error?: string; warning?: string | null; contract?: ContractItem };
      if (!res.ok || !d.contract) {
        setError(d.error ?? "Could not send the contract.");
        return;
      }
      onSent(d.contract, d.warning ?? null);
    } finally {
      setBusy(null);
    }
  }

  const field = (label: string, k: keyof typeof f, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className={labelClass.default}>{label}</span>
      <input value={f[k]} onChange={set(k)} className={`${inputClass.sm} mt-1 w-full`} {...props} />
    </label>
  );

  return (
    <div className="mt-4 space-y-3 rounded-lg border-2 border-pink-200 bg-pink-50/40 p-4">
      <p className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Create contract
        <InfoTip text="For when the client didn't use the request link. Price it by this project's rates (like the request page), type a price, or give just an hourly rate when the hours aren't known. Email it, the client signs and replies with it, then use Upload signed copy on the row, which marks the change order Approved." wide />
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("Title", "coTitle")}
        <div>
          <span className={labelClass.default}>Pricing</span>
          <div className="mt-1 inline-flex overflow-hidden rounded-md border border-gray-300 text-xs">
            {(["rates", "price", "hourly"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 font-medium ${mode === m ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                {m === "rates" ? "Use rates" : m === "price" ? "Enter a price" : "Hourly rate"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "rates" ? (
        <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {field("Cleaners *", "cleaners", { inputMode: "numeric", required: true })}
            <label className="block">
              <span className={labelClass.default}>Foremen</span>
              <input
                value={foremenEdited ? f.foremen : String(foremenCount)}
                onChange={(e) => {
                  setForemenEdited(true);
                  setF((p) => ({ ...p, foremen: e.target.value }));
                }}
                inputMode="numeric"
                className={`${inputClass.sm} mt-1 w-full`}
              />
            </label>
            {field("Start date", "startDateKey", { type: "date" })}
            {field("End date", "endDateKey", { type: "date" })}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {(["cleaner", "foreman"] as const).map((k) => (
              <label key={k} className="block">
                <span className={labelClass.default}>{k === "cleaner" ? "Cleaner rate ($/hr)" : "Foreman rate ($/hr)"}</span>
                <input
                  value={rateInputs[k]}
                  onChange={(e) => setRateInputs((r) => ({ ...r, [k]: e.target.value }))}
                  inputMode="decimal"
                  className={`${inputClass.sm} mt-1 w-full`}
                />
              </label>
            ))}
            <p className="self-end pb-1 text-[11px] text-gray-500 sm:col-span-2">
              {ratesEdited ? (
                <>
                  Changed for this contract only; the project keeps its rates.{" "}
                  <button
                    type="button"
                    onClick={() =>
                      setRateInputs({
                        cleaner: (baseRates.cleanerHourlyRateCents / 100).toFixed(2),
                        foreman: (baseRates.foremanHourlyRateCents / 100).toFixed(2),
                      })
                    }
                    className="text-pink-600 hover:underline"
                  >
                    Reset
                  </button>
                </>
              ) : (
                "This project's rates. Edit them for this contract only."
              )}
            </p>
          </div>
          <p className="text-xs text-gray-600">
            {ratePrice
              ? `${ratePrice.days} day${ratePrice.days === 1 ? "" : "s"} x ${pricing.coDayHours} hrs: ${centsToDollars(ratePrice.totalCents)}${ratePrice.upchargeCents > 0 ? ` (includes ${centsToDollars(ratePrice.upchargeCents)} next day surcharge)` : ""}`
              : "Enter the number of cleaners to see the price. Same math as the request page: crew x rates x hours per day x days."}
          </p>
        </div>
      ) : mode === "hourly" ? (
        <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {(["cleaner", "foreman"] as const).map((k) => (
              <label key={k} className="block">
                <span className={labelClass.default}>{k === "cleaner" ? "Rate ($/hr) *" : "Foreman rate ($/hr)"}</span>
                <input
                  value={hourlyInputs[k]}
                  onChange={(e) => setHourlyInputs((r) => ({ ...r, [k]: e.target.value }))}
                  inputMode="decimal"
                  placeholder={k === "foreman" ? "Optional" : undefined}
                  className={`${inputClass.sm} mt-1 w-full`}
                />
              </label>
            ))}
            {field("Start date", "startDateKey", { type: "date" })}
            {field("Cleaners", "cleaners", { inputMode: "numeric" })}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {field("Foremen", "foremen", { inputMode: "numeric" })}
            {field("Days", "days", { inputMode: "numeric" })}
          </div>
          <p className="text-xs text-gray-500">
            For when you don&apos;t know the hours yet: the contract shows only the rate, no total (subtotal and total read
            &quot;Billed hourly&quot;), billed for the hours actually worked. Foreman rate, crew and days are optional.
          </p>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            {field("Price ($) *", "price", { inputMode: "decimal", placeholder: "Contract value" })}
            {field("Start date", "startDateKey", { type: "date" })}
            {field("Cleaners", "cleaners", { inputMode: "numeric" })}
            <div className="grid grid-cols-2 gap-2">
              {field("Foremen", "foremen", { inputMode: "numeric" })}
              {field("Days", "days", { inputMode: "numeric" })}
            </div>
          </div>
          <p className="text-xs text-gray-500">Crew numbers are optional here; leave them blank to show only the price.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {field("Client company", "clientCompany")}
        {field("Client address", "clientAddress")}
      </div>
      <label className="block">
        <span className={labelClass.default}>Scope of work</span>
        <textarea value={f.scope} onChange={set("scope")} rows={3} className={`${inputClass.sm} mt-1 w-full`} />
      </label>
      <label className="block">
        <span className="flex items-center gap-1">
          <span className={labelClass.default}>Purchase terms</span>
          {f.purchaseTerms !== DEFAULT_PURCHASE_TERMS && (
            <button type="button" onClick={() => setF((p) => ({ ...p, purchaseTerms: DEFAULT_PURCHASE_TERMS }))} className="text-[11px] text-pink-600 hover:underline">
              Reset
            </button>
          )}
        </span>
        <textarea value={f.purchaseTerms} onChange={set("purchaseTerms")} rows={3} className={`${inputClass.sm} mt-1 w-full`} />
        <span className="text-[11px] text-gray-500">Starts with the standard terms; add to them for this contract only. Left blank, the standard terms are used.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {prefill.contacts.length > 1 ? (
          <label className="block sm:col-span-2">
            <span className={labelClass.default}>Send to</span>
            <select
              className={`${inputClass.sm} mt-1 w-full`}
              value={f.recipientEmail}
              onChange={(e) => {
                const c = prefill.contacts.find((x) => x.email === e.target.value);
                setF((p) => ({ ...p, recipientEmail: e.target.value, recipientName: c?.name ?? p.recipientName }));
              }}
            >
              {prefill.contacts.map((c) => (
                <option key={c.email} value={c.email}>
                  {c.name} ({c.email})
                </option>
              ))}
              {!prefill.contacts.some((c) => c.email === f.recipientEmail) && <option value={f.recipientEmail}>{f.recipientEmail || "Someone else"}</option>}
            </select>
          </label>
        ) : null}
        {field("Client name", "recipientName")}
        {field("Client email", "recipientEmail", { type: "email" })}
      </div>
      <label className="block">
        <span className={labelClass.default}>Message (optional)</span>
        <textarea value={f.message} onChange={set("message")} rows={2} className={`${inputClass.sm} mt-1 w-full`} placeholder="Added to the email above the sign-and-return note" />
      </label>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void preview()} disabled={busy !== null}>
          {busy === "preview" ? "Making PDF…" : "Preview PDF"}
        </Button>
        <Button size="sm" onClick={() => void send()} disabled={busy !== null}>
          {busy === "send" ? "Sending…" : "Email contract"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy !== null}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
