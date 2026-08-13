"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

const STATUSES = ["APPLIED", "INTERVIEWING", "ONBOARDING", "DENIED"];
const POSITIONS = ["Cleaner", "Painter", "Supervisor"];

export function CandidatesFilters({
  search,
  status,
  position,
  type,
}: {
  search: string;
  status: string;
  position: string;
  type: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    // Changing a filter invalidates whatever page the user was on.
    next.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <div className="flex flex-wrap gap-3">
      <input
        type="search"
        placeholder="Search by name…"
        defaultValue={search}
        onChange={(e) => update("search", e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E] w-56"
      />
      <select
        defaultValue={status}
        onChange={(e) => update("status", e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0) + s.slice(1).toLowerCase()}
          </option>
        ))}
      </select>
      <select
        defaultValue={position}
        onChange={(e) => update("position", e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
      >
        <option value="">All positions</option>
        {POSITIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        defaultValue={type}
        onChange={(e) => update("type", e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
      >
        <option value="">All types</option>
        <option value="subcontractor">Subcontractor</option>
        <option value="individual">Individual</option>
      </select>
    </div>
  );
}
