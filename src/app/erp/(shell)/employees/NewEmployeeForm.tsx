"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const inputCls = "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900";

type Props = { title: ReactNode };

export function NewEmployeeForm({ title }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payType, setPayType] = useState<"HOURLY" | "SALARY">("HOURLY");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const payload = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      email: fd.get("email") || undefined,
      phone: fd.get("phone") || undefined,
      role: fd.get("role") || undefined,
      payType,
      hourlyPay: fd.get("hourlyPay") || undefined,
      annualSalary: payType === "SALARY" ? (fd.get("annualSalary") || undefined) : undefined,
      defaultProject: fd.get("defaultProject") || undefined,
      hireDate: fd.get("hireDate") || undefined,
      status: fd.get("status") || "ACTIVE",
      notes: fd.get("notes") || undefined,
    };

    try {
      const res = await fetch("/api/erp/employees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
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

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        {title}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md bg-gray-200 px-2 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300"
        >
          {open ? "Close" : "Add employee"}
        </button>
      </div>

      {open ? (
        <form onSubmit={onSubmit} className="mt-3 w-full max-w-2xl space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
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
                  onClick={() => setPayType("HOURLY")}
                  className={`flex-1 py-2 text-center font-medium transition-colors ${payType === "HOURLY" ? "bg-pink-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  Hourly
                </button>
                <button
                  type="button"
                  onClick={() => setPayType("SALARY")}
                  className={`flex-1 py-2 text-center font-medium transition-colors ${payType === "SALARY" ? "bg-pink-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  Salary
                </button>
              </div>
              {payType === "HOURLY" ? (
                <input name="hourlyPay" type="number" min="0" step="0.01" placeholder="Hourly pay (e.g. 18.75)" className={inputCls} />
              ) : (
                <input name="annualSalary" type="number" min="0" step="0.01" placeholder="Annual salary (e.g. 50000)" className={inputCls} />
              )}
            </div>
            {payType === "SALARY" && (
              <input name="hourlyPay" type="number" min="0" step="0.01" placeholder="Est. hourly rate for labor cost" className={inputCls} />
            )}
            <input name="defaultProject" placeholder="Default project" className={inputCls} />
            <input name="hireDate" type="date" className={inputCls} />
            <select name="status" defaultValue="ACTIVE" className={inputCls}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <textarea name="notes" rows={2} placeholder="Notes" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
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
