"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const inputCls = "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900";

export function NewCandidateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Same click-outside-to-close popover pattern as NewEmployeeForm/CandidatesFilterBar.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const payload = {
      fullName: fd.get("fullName"),
      email: fd.get("email"),
      phone: fd.get("phone") || undefined,
      location: fd.get("location") || undefined,
      roles: fd.getAll("roles"),
      status: fd.get("status") || "APPLIED",
      internalNotes: fd.get("internalNotes") || undefined,
    };

    try {
      const res = await fetch("/api/erp/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to create candidate");
        setLoading(false);
        return;
      }
      setOpen(false);
      if (data.id) router.push(`/erp/candidates/${data.id}`);
      else router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close" : "Add candidate"}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
          open ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-pink-600 text-white hover:bg-pink-500"
        }`}
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
      </button>

      {open ? (
        <form
          onSubmit={onSubmit}
          className="absolute right-0 z-20 mt-2 w-96 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-lg"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="fullName" required placeholder="Full name *" className={`${inputCls} sm:col-span-2`} />
            <input name="email" type="email" required placeholder="Email *" className={inputCls} />
            <input name="phone" placeholder="Phone" className={inputCls} />
            <input name="location" placeholder="Location (City, State)" className={`${inputCls} sm:col-span-2`} />
            <select name="status" defaultValue="APPLIED" className={inputCls}>
              <option value="APPLIED">Applied</option>
              <option value="INTERVIEWING">Interviewing</option>
              <option value="ONBOARDING">Onboarding</option>
              <option value="DENIED">Denied</option>
            </select>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-gray-600">Position(s)</p>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="checkbox" name="roles" value="cleaner" className="accent-pink-600" />
                Cleaner
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="checkbox" name="roles" value="painter" className="accent-pink-600" />
                Painter
              </label>
              <label className="flex items-center gap-1.5 text-sm text-gray-700">
                <input type="checkbox" name="roles" value="supervisor" className="accent-pink-600" />
                Supervisor
              </label>
            </div>
          </div>

          <textarea
            name="internalNotes"
            rows={2}
            placeholder="Internal notes (e.g. how they applied)"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save candidate"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
