"use client";

import { useEffect, useState } from "react";

interface BuildingSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  onSelectedBuildingChange?: (building: BuildingOption | null) => void;
  name?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

interface BuildingOption {
  id: string;
  name: string;
}

export function BuildingSelect({
  value,
  onChange,
  onSelectedBuildingChange,
  name = "buildingId",
  label = "Building",
  required = false,
  disabled = false,
}: BuildingSelectProps) {
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [internalValue, setInternalValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedValue = value ?? internalValue;

  useEffect(() => {
    let cancelled = false;
    async function loadBuildings() {
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
    loadBuildings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onSelectedBuildingChange?.(buildings.find((building) => building.id === selectedValue) ?? null);
  }, [buildings, onSelectedBuildingChange, selectedValue]);

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <select
        name={name}
        value={selectedValue}
        onChange={(e) => {
          setInternalValue(e.target.value);
          onChange?.(e.target.value);
        }}
        disabled={disabled || loading}
        required={required}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
      >
        <option value="">Select a building...</option>
        {buildings.map((building) => (
          <option key={building.id} value={building.id}>
            {building.name}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
