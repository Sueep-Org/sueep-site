"use client";

import { useEffect, useState } from "react";

interface ContractorOption {
  id: string;
  name: string;
}

interface ContractorSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export function ContractorSelect({
  value,
  onChange,
  name = "contractorId",
  label = "Contractor",
  required = false,
  disabled = false,
}: ContractorSelectProps) {
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/erp/contractors");
        if (!res.ok) throw new Error("Failed to load contractors");
        const data = (await res.json()) as ContractorOption[];
        if (!cancelled) setContractors(data.filter((c) => (c as { status?: string }).status !== "INACTIVE"));
      } catch {
        if (!cancelled) setError("Could not load contractors");
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
        <option value="">Select a contractor...</option>
        {contractors.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
