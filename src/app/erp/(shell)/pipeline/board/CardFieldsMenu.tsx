"use client";

import { useEffect, useRef, useState } from "react";
import { InfoTip, useToast } from "@/app/erp/components/ui";
import { CARD_FIELDS, DEFAULT_CARD_FIELDS, MAX_CARD_FIELDS, type CardField } from "@/lib/erp/boardCardFields";

/** "Cards" button: pick up to 3 details for your cards. Saves right away, per pipeline. */
export function CardFieldsMenu({
  pipeline,
  fields,
  onChange,
}: {
  pipeline: "post-con" | "janitorial";
  fields: CardField[];
  onChange: (f: CardField[]) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function save(next: CardField[]) {
    const before = fields;
    onChange(next);
    const res = await fetch("/api/erp/pipeline/card-fields", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pipeline, fields: next }),
    }).catch(() => null);
    if (!res?.ok) {
      onChange(before);
      toast("Couldn't save your card setup", "error");
    }
  }

  function toggle(f: CardField, on: boolean) {
    // Keep the order of the list, not the order they were ticked.
    const next = CARD_FIELDS.map((x) => x.value).filter((v) => (v === f ? on : fields.includes(v)));
    if (next.length === 0) return;
    void save(next);
  }

  const options = CARD_FIELDS.filter((f) => pipeline === "post-con" || !f.postConOnly);
  const full = fields.length >= MAX_CARD_FIELDS;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="h-8 rounded-md border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Cards
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-gray-900">
            Show on cards
            <InfoTip text={`Pick up to ${MAX_CARD_FIELDS}. Only you see this setup. The deal name, its flag and a late or due-soon next step always show.`} align="right" />
          </p>
          <div className="space-y-1.5">
            {options.map((f) => {
              const on = fields.includes(f.value);
              return (
                <label key={f.value} className={`flex items-center gap-2 text-xs ${!on && full ? "text-gray-400" : "text-gray-700"}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && full}
                    onChange={(e) => toggle(f.value, e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-400"
                  />
                  {f.label}
                </label>
              );
            })}
          </div>
          <button type="button" onClick={() => void save(DEFAULT_CARD_FIELDS)} className="mt-3 text-[11px] text-pink-600 hover:underline">
            Back to the usual
          </button>
        </div>
      )}
    </div>
  );
}
