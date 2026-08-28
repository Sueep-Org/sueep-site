"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const inputCls = "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900";

export function NewEmployeeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<{ id: string; message: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Same click-outside-to-close pattern as EmployeesFilterBar's popover,
  // right next to this button — floats over the page instead of pushing
  // the header/table around when it opens.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);
  // Offshore is presented as a 3rd Pay Type option (matching the employee
  // detail page), but stays the separate isOffshore flag underneath.
  const [payMode, setPayMode] = useState<"HOURLY" | "SALARY" | "OFFSHORE">("HOURLY");

  const pendingPayload = useRef<Record<string, unknown> | null>(null);

  async function submitPayload(payload: Record<string, unknown>) {
    setError("");
    setDuplicate(null);
    setLoading(true);
    try {
      const res = await fetch("/api/erp/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { id?: string; error?: string; existingEmployeeId?: string; duplicateName?: boolean };
      if (!res.ok) {
        if (res.status === 409 && data.duplicateName && data.existingEmployeeId) {
          pendingPayload.current = payload;
          setDuplicate({ id: data.existingEmployeeId, message: data.error || "An employee with this name already exists" });
          setLoading(false);
          return;
        }
        setError(data.error || "Failed to create employee");
        setLoading(false);
        return;
      }
      setOpen(false);
      if (data.id) router.push(`/erp/employees/${data.id}`);
      else router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const payload: Record<string, unknown> = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      email: fd.get("email") || undefined,
      phone: fd.get("phone") || undefined,
      role: fd.get("role") || undefined,
      hireDate: fd.get("hireDate") || undefined,
      status: fd.get("status") || "ACTIVE",
      notes: fd.get("notes") || undefined,
      isOffshore: payMode === "OFFSHORE",
      offshoreMonthlyRate: payMode === "OFFSHORE" ? (fd.get("offshoreMonthlyRate") || undefined) : undefined,
    };
    if (payMode !== "OFFSHORE") {
      payload.payType = payMode;
      payload.hourlyPay = fd.get("hourlyPay") || undefined;
      payload.annualSalary = payMode === "SALARY" ? (fd.get("annualSalary") || undefined) : undefined;
    }

    await submitPayload(payload);
  }

  async function createAnyway() {
    if (!pendingPayload.current) return;
    await submitPayload({ ...pendingPayload.current, confirmDuplicate: true });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close" : "Add employee"}
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
            <input name="firstName" required placeholder="First name *" className={inputCls} />
            <input name="lastName" required placeholder="Last name *" className={inputCls} />
            <input name="email" type="email" placeholder="Email" className={inputCls} />
            <input name="phone" placeholder="Phone" className={inputCls} />
            <input name="role" placeholder="Role" className={inputCls} />
            <div className="flex flex-col gap-1">
              <div className="flex rounded-md border border-gray-300 overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => setPayMode("HOURLY")}
                  className={`flex-1 py-2 text-center font-medium transition-colors ${payMode === "HOURLY" ? "bg-pink-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  Hourly
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode("SALARY")}
                  className={`flex-1 py-2 text-center font-medium transition-colors ${payMode === "SALARY" ? "bg-pink-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  Salary
                </button>
                <button
                  type="button"
                  onClick={() => setPayMode("OFFSHORE")}
                  className={`flex-1 py-2 text-center font-medium transition-colors ${payMode === "OFFSHORE" ? "bg-pink-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  Offshore
                </button>
              </div>
              {payMode === "HOURLY" ? (
                <input name="hourlyPay" type="number" min="0" step="0.01" placeholder="Hourly pay (e.g. 18.75)" className={inputCls} />
              ) : payMode === "SALARY" ? (
                <input name="annualSalary" type="number" min="0" step="0.01" placeholder="Annual salary (e.g. 50000)" className={inputCls} />
              ) : (
                <input name="offshoreMonthlyRate" type="number" min="0" step="0.01" placeholder="Fixed monthly rate (e.g. 1200.00)" className={inputCls} />
              )}
            </div>
            {payMode === "SALARY" && (
              <input name="hourlyPay" type="number" min="0" step="0.01" placeholder="Est. hourly rate for labor cost" className={inputCls} />
            )}
            <input name="hireDate" type="date" className={inputCls} />
            <select name="status" defaultValue="ACTIVE" className={inputCls}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <textarea name="notes" rows={2} placeholder="Notes" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          {duplicate ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs text-amber-700">{duplicate.message}.</p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`/erp/employees/${duplicate.id}`}
                  className="text-xs font-medium text-amber-800 underline hover:no-underline"
                >
                  View existing profile
                </a>
                <button
                  type="button"
                  onClick={() => void createAnyway()}
                  disabled={loading}
                  className="text-xs font-medium text-amber-800 underline hover:no-underline disabled:opacity-50"
                >
                  {loading ? "Creating…" : "Create anyway (different person)"}
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save employee"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
