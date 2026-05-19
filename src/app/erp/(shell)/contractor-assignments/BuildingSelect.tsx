"use client";

import { useEffect, useState } from "react";

interface BuildingOption {
  id: string;
  name: string;
  address: string;
}

interface BuildingSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export function BuildingSelect({
  value,
  onChange,
  name = "buildingId",
  label = "Building",
  required = false,
  disabled = false,
}: BuildingSelectProps) {
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/erp/buildings");
        if (!res.ok) throw new Error("Failed to load buildings");
        const data = (await res.json()) as BuildingOption[];
        if (!cancelled) setBuildings(data);
      } catch {
        if (!cancelled) setError("Could not load buildings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <select
        name={name}
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled || loading}
        required={required}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
      >
        <option value="">Select a building...</option>
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} — {b.address}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
