"use client";

import { useEffect, useId, useState } from "react";
import { matchUnitName } from "@/lib/erp/unitNames";

/**
 * The unit box on turnover forms. Suggests the units this building already
 * has, and when a typed name is the same unit written differently, says which
 * spelling it saves as (the server does the same, see unitNames.ts), so one
 * unit doesn't end up under two names.
 */
export function UnitNameInput({
  buildingId,
  knownNames,
  value,
  onChange,
  id,
  name,
  className,
  placeholder,
}: {
  buildingId: string | null | undefined;
  /** The building's unit names when the form already has them; skips the fetch. */
  knownNames?: string[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  className?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const [fetched, setNames] = useState<string[]>([]);
  const names = knownNames ?? fetched;
  const shouldFetch = knownNames === undefined;

  useEffect(() => {
    if (!shouldFetch) return;
    if (!buildingId) {
      setNames([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/erp/buildings/${buildingId}/unit-names`)
      .then((r) => (r.ok ? r.json() : { names: [] }))
      .then((d: { names?: string[] }) => !cancelled && setNames(d.names ?? []))
      .catch(() => !cancelled && setNames([]));
    return () => {
      cancelled = true;
    };
  }, [buildingId, shouldFetch]);

  const typed = value.trim();
  const savesAs = typed ? matchUnitName(typed, names) : typed;

  return (
    <>
      <input
        id={id}
        name={name}
        list={names.length > 0 ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        placeholder={placeholder}
        autoComplete="off"
      />
      {names.length > 0 && (
        <datalist id={listId}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
      {savesAs !== typed && (
        <p className="mt-1 text-[11px] text-amber-700">
          Saves as &ldquo;{savesAs}&rdquo;, how this building already writes this unit.{" "}
          <button type="button" onClick={() => onChange(savesAs)} className="font-medium text-pink-600 hover:underline">
            Use it
          </button>
        </p>
      )}
    </>
  );
}
