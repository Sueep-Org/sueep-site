"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CUSTOM_LINE_ITEMS_ENABLED,
  TURNOVER_UNIT_LAYOUTS,
  getTurnoverPricingPackage,
  makeCustomLineItemId,
  sanitizeTurnoverPricingPackage,
  type CustomLineItemKind,
  type CustomLineItemType,
  type TurnoverPricingPackage,
} from "@/lib/turnoverPricingPackages";

type CustomLineItemDraft = {
  id: string;
  label: string;
  type: CustomLineItemType;
  amount: string;
  kind: CustomLineItemKind;
};

const CUSTOM_LINE_ITEM_TYPE_LABELS: Record<CustomLineItemType, string> = {
  flat: "Flat $ per unit",
  percentOfPainting: "% of painting price",
  percentOfCleaning: "% of cleaning price",
};

const CUSTOM_LINE_ITEM_KIND_LABELS: Record<CustomLineItemKind, string> = {
  charge: "Extra charge (price only)",
  workItem: "Work item (crew does this)",
};


type Props = {
  buildingId: string;
  buildingName: string;
  initialPackage: unknown;
  canEdit: boolean;
};

function dollars(value: number | undefined) {
  return String(value ?? 0);
}

export function BuildingPricingPackageEditor({ buildingId, buildingName, initialPackage, canEdit }: Props) {
  const router = useRouter();
  const initial = useMemo(
    () => getTurnoverPricingPackage(buildingName, initialPackage),
    [buildingName, initialPackage]
  );
  const [label, setLabel] = useState(initial.label);
  const [cleaning, setCleaning] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, dollars(initial.cleaningLayoutRates?.[layout])]))
  );
  const [painting, setPainting] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, dollars(initial.paintingLayoutRates?.[layout])]))
  );
  const [touchUpPaint, setTouchUpPaint] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, dollars(initial.touchUpPaintLayoutRates?.[layout])]))
  );
  const [carpetCleaning, setCarpetCleaning] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, dollars(initial.carpetCleaningLayoutRates?.[layout])]))
  );
  const [additionalMaterials, setAdditionalMaterials] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, dollars(initial.additionalMaterialsLayoutRates?.[layout])]))
  );
  const [ceilingPaint, setCeilingPaint] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, dollars(initial.ceilingPaintLayoutRates?.[layout])]))
  );
  const [compounding, setCompounding] = useState<Record<string, string>>(() =>
    Object.fromEntries(TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, dollars(initial.compoundingLayoutRates?.[layout])]))
  );
  const [customLineItems, setCustomLineItems] = useState<CustomLineItemDraft[]>(() =>
    (initial.customLineItems ?? []).map((item) => ({ ...item, amount: String(item.amount) }))
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function packagePayload(): TurnoverPricingPackage {
    const cleaningLayoutRates = Object.fromEntries(
      TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, Math.max(0, Math.round(Number(cleaning[layout]) || 0))])
    );
    const paintingLayoutRates = Object.fromEntries(
      TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, Math.max(0, Math.round(Number(painting[layout]) || 0))])
    );
    const touchUpPaintLayoutRates = Object.fromEntries(
      TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, Math.max(0, Math.round(Number(touchUpPaint[layout]) || 0))])
    );
    const carpetCleaningLayoutRates = Object.fromEntries(
      TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, Math.max(0, Math.round(Number(carpetCleaning[layout]) || 0))])
    );
    const additionalMaterialsLayoutRates = Object.fromEntries(
      TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, Math.max(0, Math.round(Number(additionalMaterials[layout]) || 0))])
    );
    const ceilingPaintLayoutRates = Object.fromEntries(
      TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, Math.max(0, Math.round(Number(ceilingPaint[layout]) || 0))])
    );
    const compoundingLayoutRates = Object.fromEntries(
      TURNOVER_UNIT_LAYOUTS.map((layout) => [layout, Math.max(0, Math.round(Number(compounding[layout]) || 0))])
    );
    const validCustomLineItems = customLineItems
      .filter((item) => item.label.trim())
      .map((item) => ({
        id: item.id,
        label: item.label.trim(),
        type: item.type,
        amount: Math.max(0, Number(item.amount) || 0),
        kind: item.kind,
      }));

    return sanitizeTurnoverPricingPackage({
      label,
      cleaningLayoutRates,
      paintingLayoutRates,
      touchUpPaintLayoutRates,
      carpetCleaningLayoutRates,
      additionalMaterialsLayoutRates,
      ceilingPaintLayoutRates,
      compoundingLayoutRates,
      customLineItems: validCustomLineItems,
    });
  }

  function addCustomLineItem() {
    setCustomLineItems((current) => [
      ...current,
      { id: makeCustomLineItemId(`item-${current.length + 1}`), label: "", type: "flat", amount: "0", kind: "charge" },
    ]);
  }

  function updateCustomLineItem(id: string, patch: Partial<CustomLineItemDraft>) {
    setCustomLineItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeCustomLineItem(id: string) {
    setCustomLineItems((current) => current.filter((item) => item.id !== id));
  }

  async function savePackage() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pricingPackage: packagePayload() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to save pricing package");
        return;
      }
      setMessage("Pricing package saved. New turnover requests will use these rates.");
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
          <h2 className="text-sm font-semibold text-gray-900">Pricing package</h2>
          <p className="mt-1 text-xs text-gray-500">Editable by Admin, Project Manager, or Estimation.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${canEdit ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
          {canEdit ? "Editable" : "View only"}
        </span>
      </div>

      <label className="mt-4 block text-xs font-medium text-gray-600">
        Package name
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={!canEdit || loading}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
        />
      </label>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 pr-3">Unit</th>
              <th className="py-2 pr-3">Cleaning</th>
              <th className="py-2 pr-3">Painting</th>
              <th className="py-2 pr-3">Touch-up Paint</th>
              <th className="py-2 pr-3">Carpet Cleaning</th>
              <th className="py-2 pr-3">Add. Materials</th>
              <th className="py-2 pr-3">Ceiling Paint</th>
              <th className="py-2">Compounding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {TURNOVER_UNIT_LAYOUTS.map((layout) => (
              <tr key={layout}>
                <td className="py-2 pr-3 font-medium text-gray-900">{layout}</td>
                <td className="py-2 pr-3">
                  <input
                    value={cleaning[layout]}
                    onChange={(event) => setCleaning((current) => ({ ...current, [layout]: event.target.value }))}
                    disabled={!canEdit || loading}
                    type="number"
                    min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={painting[layout]}
                    onChange={(event) => setPainting((current) => ({ ...current, [layout]: event.target.value }))}
                    disabled={!canEdit || loading}
                    type="number"
                    min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={touchUpPaint[layout]}
                    onChange={(event) => setTouchUpPaint((current) => ({ ...current, [layout]: event.target.value }))}
                    disabled={!canEdit || loading}
                    type="number"
                    min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={carpetCleaning[layout]}
                    onChange={(event) => setCarpetCleaning((current) => ({ ...current, [layout]: event.target.value }))}
                    disabled={!canEdit || loading}
                    type="number"
                    min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={additionalMaterials[layout]}
                    onChange={(event) => setAdditionalMaterials((current) => ({ ...current, [layout]: event.target.value }))}
                    disabled={!canEdit || loading}
                    type="number"
                    min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={ceilingPaint[layout]}
                    onChange={(event) => setCeilingPaint((current) => ({ ...current, [layout]: event.target.value }))}
                    disabled={!canEdit || loading}
                    type="number"
                    min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                  />
                </td>
                <td className="py-2">
                  <input
                    value={compounding[layout]}
                    onChange={(event) => setCompounding((current) => ({ ...current, [layout]: event.target.value }))}
                    disabled={!canEdit || loading}
                    type="number"
                    min="0"
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {CUSTOM_LINE_ITEMS_ENABLED && (
      <div className="mt-6">
        <h3 className="text-sm font-semibold text-gray-900">Custom pricing items</h3>
        <p className="mt-1 text-xs text-gray-500">
          Extra line items specific to this building only (e.g. a den surcharge or an occupied-unit fee). Each
          shows up as a checkbox on this building&apos;s unit scope form and prices itself automatically.
        </p>

        {customLineItems.length > 0 && (
          <div className="mt-3 space-y-2">
            {customLineItems.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2">
                <input
                  value={item.label}
                  onChange={(event) => updateCustomLineItem(item.id, { label: event.target.value })}
                  disabled={!canEdit || loading}
                  placeholder="Label, e.g. Has den"
                  className="min-w-[160px] flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                />
                <select
                  value={item.type}
                  onChange={(event) => updateCustomLineItem(item.id, { type: event.target.value as CustomLineItemType })}
                  disabled={!canEdit || loading}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                >
                  {(Object.keys(CUSTOM_LINE_ITEM_TYPE_LABELS) as CustomLineItemType[]).map((type) => (
                    <option key={type} value={type}>{CUSTOM_LINE_ITEM_TYPE_LABELS[type]}</option>
                  ))}
                </select>
                <select
                  value={item.kind}
                  onChange={(event) => updateCustomLineItem(item.id, { kind: event.target.value as CustomLineItemKind })}
                  disabled={!canEdit || loading}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                >
                  {(Object.keys(CUSTOM_LINE_ITEM_KIND_LABELS) as CustomLineItemKind[]).map((kind) => (
                    <option key={kind} value={kind}>{CUSTOM_LINE_ITEM_KIND_LABELS[kind]}</option>
                  ))}
                </select>
                <input
                  value={item.amount}
                  onChange={(event) => updateCustomLineItem(item.id, { amount: event.target.value })}
                  disabled={!canEdit || loading}
                  type="number"
                  min="0"
                  className="w-24 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100"
                />
                <button
                  type="button"
                  onClick={() => removeCustomLineItem(item.id)}
                  disabled={!canEdit || loading}
                  aria-label={`Remove ${item.label || "item"}`}
                  className="rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addCustomLineItem}
          disabled={!canEdit || loading}
          className="mt-3 rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:border-pink-400 hover:text-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add custom item
        </button>
      </div>
      )}

      {error ? <p className="mt-3 text-xs text-red-600" role="alert">{error}</p> : null}
      {message ? <p className="mt-3 text-xs text-emerald-700" role="status">{message}</p> : null}

      <button
        type="button"
        onClick={savePackage}
        disabled={!canEdit || loading}
        className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {loading ? "Saving..." : "Save pricing package"}
      </button>
    </section>
  );
}
