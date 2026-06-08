"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300";
const labelCls = "block text-xs font-medium text-gray-600";

type Props = {
  projectId: string;
  description: string | null;
  contractValueCents: number | null;
};

function getDetailLine(description: string | null, label: string) {
  const prefix = `${label}:`;
  return (description || "")
    .split(/\r?\n/)
    .find((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()))
    ?.replace(new RegExp(`^${label}:\\s*`, "i"), "")
    .trim() || "";
}

function upsertDetailLine(description: string | null, label: string, value: string) {
  const lines = (description || "").split(/\r?\n/).filter((line) => line.length > 0);
  const prefix = `${label}:`;
  const nextLine = `${prefix} ${value.trim()}`;
  const index = lines.findIndex((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()));

  if (!value.trim()) {
    return index >= 0 ? lines.filter((_, i) => i !== index).join("\n") : lines.join("\n");
  }

  if (index >= 0) {
    lines[index] = nextLine;
  } else {
    const pricingIndex = lines.findIndex((line) => line.trim().toLowerCase().startsWith("pricing breakdown:"));
    lines.splice(pricingIndex >= 0 ? pricingIndex + 1 : lines.length, 0, nextLine);
  }

  return lines.join("\n");
}

export function ProjectPricePackageEditor({ projectId, description, contractValueCents }: Props) {
  const router = useRouter();
  const building = useMemo(() => getDetailLine(description, "Property"), [description]);
  const standardPackage = useMemo(() => getDetailLine(description, "Pricing Breakdown"), [description]);
  const initialSpecialPackage = useMemo(() => getDetailLine(description, "Special Pricing Package"), [description]);
  const [specialPackage, setSpecialPackage] = useState(initialSpecialPackage);
  const [packagePrice, setPackagePrice] = useState(
    contractValueCents != null ? (contractValueCents / 100).toFixed(2) : "",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const nextDescription = upsertDetailLine(description, "Special Pricing Package", specialPackage);
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: nextDescription || null,
          contractValue: packagePrice === "" ? null : Number(packagePrice),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase text-gray-500">Price package</p>
          <p className="mt-1 text-sm text-gray-700">
            {building ? `Building: ${building}` : "Special pricing package for this project/building."}
          </p>
        </div>
        <div className="min-w-0 sm:w-44">
          <label className={labelCls} htmlFor="package-price">
            Package price ($)
          </label>
          <input
            id="package-price"
            type="number"
            min={0}
            step={0.01}
            className={inputCls}
            value={packagePrice}
            onChange={(e) => setPackagePrice(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      {standardPackage ? (
        <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase text-gray-500">Current package detail</p>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{standardPackage}</p>
        </div>
      ) : null}

      <div className="mt-3">
        <label className={labelCls} htmlFor="special-package">
          Special pricing package
        </label>
        <textarea
          id="special-package"
          rows={3}
          className={inputCls}
          value={specialPackage}
          onChange={(e) => setSpecialPackage(e.target.value)}
          placeholder="Add custom pricing notes, building-specific package terms, or approved special rate."
        />
      </div>

      {error ? (
        <p className="mt-2 text-xs text-red-500" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="mt-3 rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Save price package"}
      </button>
    </form>
  );
}
