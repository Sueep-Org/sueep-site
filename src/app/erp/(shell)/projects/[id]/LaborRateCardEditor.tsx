"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, labelClass } from "@/app/erp/components/ui";
import { centsToDollars, parseMoneyInput } from "@/lib/erp/money";
import {
  DEFAULT_CHANGE_ORDER_LABOR_RATES,
  sanitizeChangeOrderLaborRateCard,
  type ChangeOrderLaborRateCard,
} from "@/lib/changeOrderLaborRates";

const input = inputClass.md;
const label = labelClass.default;

type Props = {
  projectId: string;
  initialRateCard: unknown;
  canEdit: boolean;
};

/** Dollar-string form state for one rate: "" means "use the default". */
function toDollarInput(cents: number | undefined): string {
  return cents === undefined ? "" : String(cents / 100);
}

/** Project-level override for the Cleaner/Foreman $/hr used to price change
 * order labor (see src/lib/changeOrderLaborRates.ts). Any row left blank
 * falls back to the company default shown as its placeholder. */
export function LaborRateCardEditor({ projectId, initialRateCard, canEdit }: Props) {
  const router = useRouter();
  const initial: ChangeOrderLaborRateCard = sanitizeChangeOrderLaborRateCard(initialRateCard);

  const [cleaner, setCleaner] = useState(toDollarInput(initial.cleanerHourlyRateCents));
  const [foreman, setForeman] = useState(toDollarInput(initial.foremanHourlyRateCents));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function onSave() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const cleanerCents = cleaner.trim() === "" ? undefined : parseMoneyInput(cleaner);
      const foremanCents = foreman.trim() === "" ? undefined : parseMoneyInput(foreman);
      if (cleaner.trim() !== "" && cleanerCents === null) {
        setError("Cleaner rate isn't a valid dollar amount");
        setLoading(false);
        return;
      }
      if (foreman.trim() !== "" && foremanCents === null) {
        setError("Foreman rate isn't a valid dollar amount");
        setLoading(false);
        return;
      }

      const rateCard: ChangeOrderLaborRateCard = {};
      if (cleanerCents != null) rateCard.cleanerHourlyRateCents = cleanerCents;
      if (foremanCents != null) rateCard.foremanHourlyRateCents = foremanCents;

      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ laborRateCard: rateCard }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to save labor rates");
        return;
      }
      setMessage("Labor rates saved. Change order pricing packages will use these rates.");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Labor rates</h2>
          <p className="mt-1 text-xs text-gray-500">
            This project&apos;s Cleaner/Foreman $/hr for change order pricing packages. Leave a row blank to use the
            company default.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${canEdit ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
          {canEdit ? "Editable" : "View only"}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="rate-cleaner">
            Cleaner $/hr
          </label>
          <input
            id="rate-cleaner"
            type="number"
            min={0}
            step="0.01"
            className={input}
            value={cleaner}
            onChange={(e) => setCleaner(e.target.value)}
            disabled={!canEdit || loading}
            placeholder={centsToDollars(DEFAULT_CHANGE_ORDER_LABOR_RATES.cleanerHourlyRateCents)}
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Default: {centsToDollars(DEFAULT_CHANGE_ORDER_LABOR_RATES.cleanerHourlyRateCents)}/hr
          </p>
        </div>
        <div>
          <label className={label} htmlFor="rate-foreman">
            Foreman / Supervisor $/hr
          </label>
          <input
            id="rate-foreman"
            type="number"
            min={0}
            step="0.01"
            className={input}
            value={foreman}
            onChange={(e) => setForeman(e.target.value)}
            disabled={!canEdit || loading}
            placeholder={centsToDollars(DEFAULT_CHANGE_ORDER_LABOR_RATES.foremanHourlyRateCents)}
          />
          <p className="mt-1 text-[11px] text-gray-400">
            Default: {centsToDollars(DEFAULT_CHANGE_ORDER_LABOR_RATES.foremanHourlyRateCents)}/hr
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-3 text-xs text-emerald-700" role="status">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onSave}
        disabled={!canEdit || loading}
        className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {loading ? "Saving…" : "Save labor rates"}
      </button>
    </section>
  );
}
