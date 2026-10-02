"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Small "i" icon that shows an explanation on hover, keyboard focus, or tap,
 * so helper text doesn't have to sit on the page. `align` picks which edge
 * the bubble lines up with, for icons near the right side of a container.
 *
 * Uses a named group (group/infotip): a plain `group` would also react to
 * any ancestor marked `group` (like CollapsibleSection's <details>), opening
 * every tip in the section whenever anything in it is hovered or focused.
 */
export function InfoTip({ text, align = "left" }: { text: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <span ref={ref} className="group/infotip relative inline-flex align-middle">
      <button
        type="button"
        aria-label="More info"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold leading-none text-gray-400 hover:border-gray-400 hover:text-gray-600 focus:outline-none focus:ring-1 focus:ring-pink-500"
      >
        i
      </button>
      <span
        role="tooltip"
        className={`absolute top-full z-30 mt-1 w-64 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg ${
          align === "right" ? "right-0" : "left-0"
        } ${open ? "block" : "hidden group-hover/infotip:block group-focus-within/infotip:block"}`}
      >
        {text}
      </span>
    </span>
  );
}
