"use client";

import { useState } from "react";

type EmployeeOption = { id: string; firstName: string; lastName: string };

export function ProjectCommissionOwnerEditor({
  projectId,
  employees,
  commissionEmployeeId,
  autoMatchedEmployee,
}: {
  projectId: string;
  employees: EmployeeOption[];
  commissionEmployeeId: string | null;
  autoMatchedEmployee: EmployeeOption | null;
}) {
  const [value, setValue] = useState(commissionEmployeeId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setValue(next);
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commissionEmployeeId: next || null }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setValue(commissionEmployeeId ?? "");
      setError("Failed to update commission owner");
    } finally {
      setSaving(false);
    }
  }

  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
      Commission owner:
      <select
        value={value}
        onChange={handleChange}
        disabled={saving}
        className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-700 disabled:opacity-50"
      >
        <option value="">
          {autoMatchedEmployee
            ? `Auto (${autoMatchedEmployee.firstName} ${autoMatchedEmployee.lastName})`
            : "Auto (no HubSpot match)"}
        </option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.firstName} {e.lastName}
          </option>
        ))}
      </select>
      {error && <span className="text-red-500">{error}</span>}
    </p>
  );
}
