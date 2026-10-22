"use client";

import { useState } from "react";
import { formatScore } from "@/lib/erp/subScores";

const SIZES = { xs: "text-xs", sm: "text-sm", md: "text-base", lg: "text-2xl" } as const;
type Size = keyof typeof SIZES;
const NUMBER_SIZES: Record<Size, string> = { xs: "text-[10px]", sm: "text-xs", md: "text-xs", lg: "text-sm" };

/** A 1-5 score as stars, filled to the exact average (4.3 fills a third of the fifth), with the number small and gray after them. */
export function Stars({
  value,
  size = "sm",
  emptyText = "-",
  showNumber = true,
}: {
  value: number | null;
  size?: Size;
  emptyText?: string;
  showNumber?: boolean;
}) {
  if (value == null) return <span className="text-gray-400">{emptyText}</span>;
  const label = `${formatScore(value)} out of 5`;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`relative inline-block leading-none tracking-tight ${SIZES[size]}`} title={label} aria-label={label} role="img">
        <span className="text-gray-300">★★★★★</span>
        <span className="absolute inset-y-0 left-0 overflow-hidden text-amber-400" style={{ width: `${(Math.max(0, Math.min(5, value)) / 5) * 100}%` }}>
          ★★★★★
        </span>
      </span>
      {showNumber ? <span className={`${NUMBER_SIZES[size]} font-normal text-gray-400`}>{formatScore(value)}</span> : null}
    </span>
  );
}

/** Click a star to pick 1-5. Hovering previews. */
export function StarInput({ value, onChange, size = "lg" }: { value: number | null; onChange: (v: number) => void; size?: Size }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <span className={`inline-flex leading-none ${SIZES[size]}`} onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          className={`px-0.5 transition-colors ${n <= shown ? "text-amber-400" : "text-gray-300 hover:text-amber-200"}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
