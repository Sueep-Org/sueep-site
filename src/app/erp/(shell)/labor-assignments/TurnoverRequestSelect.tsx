"use client";

import { useEffect, useState } from "react";

interface TurnoverRequestOption {
  id: string;
  requestType: string;
  unitNumber: string | null;
  building: { name: string };
}

interface TurnoverRequestSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export function TurnoverRequestSelect({
  value,
  onChange,
  name = "turnoverRequestId",
  label = "Turnover request",
  required = false,
  disabled = false,
}: TurnoverRequestSelectProps) {
  const [requests, setRequests] = useState<TurnoverRequestOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRequests() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/erp/turnover-requests");
        if (!res.ok) throw new Error("Failed to load turnover requests");
        const data = (await res.json()) as TurnoverRequestOption[];
        if (!cancelled) setRequests(data);
      } catch {
        if (!cancelled) setError("Could not load turnover requests");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRequests();
    return () => {
      cancelled = true;
    };
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
        <option value="">Select a turnover request...</option>
        {requests.map((request) => (
          <option key={request.id} value={request.id}>
            {request.building.name} • {request.requestType}{request.unitNumber ? ` • ${request.unitNumber}` : ""}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
