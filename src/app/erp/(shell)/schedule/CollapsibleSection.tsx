"use client";

import { useState } from "react";

export function CollapsibleSection({
  title,
  description,
  headerExtra,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={["h-4 w-4 shrink-0 text-gray-400 transition-transform", open ? "rotate-180" : ""].join(" ")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <div>
            <h2 className="text-base font-semibold text-gray-800">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
          </div>
        </button>
        {headerExtra && <div className="shrink-0">{headerExtra}</div>}
      </div>
      {open && <div className="p-5">{children}</div>}
    </section>
  );
}
