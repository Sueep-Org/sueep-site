"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/erp/components/ui";
import { centsToDollars } from "@/lib/erp/money";
import { calculatePricing, emptyPricing, type ContractPricing } from "@/lib/erp/janitorialPricing";
import { PricingCalculator } from "../../PricingCalculator";

/** The contract's Pricing tab: the only place its monthly rate is set. */
export function ContractPricingEditor({
  contractId,
  initialPricing,
  currentMonthlyRateCents,
}: {
  contractId: string;
  initialPricing: ContractPricing | null;
  currentMonthlyRateCents: number;
}) {
  const router = useRouter();
  const toast = useToast();
  // A contract priced by hand before the calculator starts with its current
  // rate as the override, so saving without changes keeps the same price.
  const [start] = useState<ContractPricing>(() => initialPricing ?? { ...emptyPricing(), totalOverrideCents: currentMonthlyRateCents });
  const [pricing, setPricing] = useState<ContractPricing>(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = JSON.stringify(pricing) !== JSON.stringify(start);
  const newPrice = calculatePricing(pricing).monthlyPriceCents;
  const priceChanges = newPrice !== currentMonthlyRateCents;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/janitorial/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pricing }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't save pricing");
        return;
      }
      toast("Pricing saved", "success");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      {!initialPricing && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          This contract was priced by hand, so its current rate ({centsToDollars(currentMonthlyRateCents)}/mo) is filled in as an
          override. Add its roles and rates to see the breakdown and profit, then clear the override to use the calculated price.
        </p>
      )}

      <PricingCalculator value={pricing} onChange={setPricing} />

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-4">
        {priceChanges && (
          <p className="text-xs text-amber-700">
            Monthly rate changes from {centsToDollars(currentMonthlyRateCents)} to {centsToDollars(newPrice)}, starting with the next
            month added. Months already on the Billing tab keep their amount.
          </p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save pricing"}
        </button>
      </div>
    </div>
  );
}
