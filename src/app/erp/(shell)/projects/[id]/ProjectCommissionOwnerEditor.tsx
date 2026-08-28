"use client";

import { useState } from "react";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";

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

  async function handleChange(next: string) {
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
      <SearchableSelect
        value={value}
        onChange={handleChange}
        disabled={saving}
        options={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }))}
        placeholder="Search employees…"
        allLabel={autoMatchedEmployee ? `Auto (${autoMatchedEmployee.firstName} ${autoMatchedEmployee.lastName})` : "Auto (no HubSpot match)"}
        className="w-48"
      />
      {error && <span className="text-red-500">{error}</span>}
    </p>
  );
}
