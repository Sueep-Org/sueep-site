"use client";

import { useState, useTransition } from "react";

const STATUSES = [
  { value: "APPLIED", label: "Applied", cls: "bg-blue-100 text-blue-700" },
  { value: "INTERVIEWING", label: "Interviewing", cls: "bg-purple-100 text-purple-700" },
  { value: "ONBOARDING", label: "Onboarding", cls: "bg-emerald-100 text-emerald-700" },
  { value: "DENIED", label: "Denied", cls: "bg-gray-100 text-gray-500" },
];

export function CandidateStatusSelect({ id, initialStatus }: { id: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [, startTransition] = useTransition();

  const current = STATUSES.find((s) => s.value === status) ?? {
    value: status,
    label: status,
    cls: "bg-gray-100 text-gray-500",
  };

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setStatus(next);
    startTransition(async () => {
      await fetch(`/api/erp/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
    });
  }

  return (
    <select
      value={status}
      onChange={handleChange}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-offset-1 ${current.cls}`}
    >
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}