"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TURNOVER_UNIT_LAYOUTS,
  REAL_ESTATE_PRICING_PACKAGE,
  sanitizeTurnoverPricingPackage,
  type TurnoverPricingPackage,
} from "@/lib/turnoverPricingPackages";

type Props = {
  projectId: string;
  initialPackage: unknown;
};

function dollars(value: number | undefined) {
  return String(value ?? 0);
}

export function RealEstatePricingPackageEditor({ projectId, initialPackage }: Props) {
  const router = useRouter();
  const initial = useMemo(
    () => sanitizeTurnoverPricingPackage(initialPackage, REAL_ESTATE_PRICING_PACKAGE),
    [initialPackage]
  );

  const [label, setLabel] = useState(initial.label);
  const [cleaning, setCleaning] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((l) => [l, dollars(initial.cleaningLayoutRates?.[l])]))
  );
  const [painting, setPainting] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((l) => [l, dollars(initial.paintingLayoutRates?.[l])]))
  );
  const [carpetCleaning, setCarpetCleaning] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((l) => [l, dollars(initial.carpetCleaningLayoutRates?.[l])]))
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function packagePayload(): TurnoverPricingPackage {
    return sanitizeTurnoverPricingPackage({
      label,
      cleaningLayoutRates: Object.fromEntries(
        TURNOVER_UNIT_LAYOUTS.map((l) => [l, Math.max(0, Math.round(Number(cleaning[l]) || 0))])
      ),
      paintingLayoutRates: Object.fromEntries(
        TURNOVER_UNIT_LAYOUTS.map((l) => [l, Math.max(0, Math.round(Number(painting[l]) || 0))])
      ),
      carpetCleaningLayoutRates: Object.fromEntries(
        TURNOVER_UNIT_LAYOUTS.map((l) => [l, Math.max(0, Math.round(Number(carpetCleaning[l]) || 0))])
      ),
    }, REAL_ESTATE_PRICING_PACKAGE);
  }

  async function save() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pricingPackage: packagePayload() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Failed to save"); return; }
      setMessage("Pricing package saved.");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function resetToDefault() {
    const pkg = REAL_ESTATE_PRICING_PACKAGE;
    setLabel(pkg.label);
    setCleaning(Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((l) => [l, dollars(pkg.cleaningLayoutRates?.[l])])));
    setPainting(Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((l) => [l, dollars(pkg.paintingLayoutRates?.[l])])));
    setCarpetCleaning(Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((l) => [l, dollars(pkg.carpetCleaningLayoutRates?.[l])])));
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Pricing package</h2>
          <p className="mt-1 text-xs text-gray-500">Rates for this property. Defaults to 2× standard janitorial.</p>
        </div>
        <button
          type="button"
          onClick={resetToDefault}
          disabled={loading}
          className="text-xs text-pink-600 hover:underline disabled:opacity-50"
        >
          Reset to default
        </button>
      </div>

      <label className="mt-4 block text-xs font-medium text-gray-600">
        Package name
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={loading}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
        />
      </label>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 pr-3">Unit</th>
              <th className="py-2 pr-3">Cleaning</th>
              <th className="py-2 pr-3">Painting</th>
              <th className="py-2">Carpet Cleaning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {TURNOVER_UNIT_LAYOUTS.map((layout) => (
              <tr key={layout}>
                <td className="py-2 pr-3 font-medium text-gray-900">{layout}</td>
                <td className="py-2 pr-3">
                  <input value={cleaning[layout]} onChange={(e) => setCleaning((p) => ({ ...p, [layout]: e.target.value }))}
                    disabled={loading} type="number" min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100" />
                </td>
                <td className="py-2 pr-3">
                  <input value={painting[layout]} onChange={(e) => setPainting((p) => ({ ...p, [layout]: e.target.value }))}
                    disabled={loading} type="number" min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100" />
                </td>
                <td className="py-2">
                  <input value={carpetCleaning[layout]} onChange={(e) => setCarpetCleaning((p) => ({ ...p, [layout]: e.target.value }))}
                    disabled={loading} type="number" min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <p className="mt-3 text-xs text-red-600" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-xs text-emerald-700" role="status">{message}</p> : null}

      <button
        type="button"
        onClick={save}
        disabled={loading}
        className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save pricing package"}
      </button>
    </section>
  );
}
