"use client";

import { useEffect, useState } from "react";

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface EmployeeSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}

export function EmployeeSelect({
  value,
  onChange,
  name = "laborerId",
  label = "Laborer",
  required = false,
  disabled = false,
}: EmployeeSelectProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/erp/employees");
        if (!res.ok) throw new Error("Failed to load employees");
        const data = (await res.json()) as EmployeeOption[];
        if (!cancelled) setEmployees(data);
      } catch {
        if (!cancelled) setError("Could not load employees");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEmployees();
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
        <option value="">Select a laborer...</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.firstName} {employee.lastName}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
