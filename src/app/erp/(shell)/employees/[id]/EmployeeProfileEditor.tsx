"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

type Props = {
  employeeId: string;
  canSeePay?: boolean;
  initial: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    dateOfBirth: string | null;
    role: string | null;
    payType: string;
    hourlyPayCents: number | null;
    annualSalaryCents: number | null;
    status: string;
    hireDate: string | null;
    notes: string | null;
    isOffshore: boolean;
    offshoreMonthlyRateCents: number | null;
  };
};

export function EmployeeProfileEditor({ employeeId, canSeePay = true, initial }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  // UI-only grouping: Offshore is shown as a third Pay Type option, but under
  // the hood it's still the separate isOffshore flag. payType/hourlyPay/
  // annualSalary are left completely untouched (omitted from the PATCH
  // payload) whenever Offshore is selected, so switching into/out of it
  // never overwrites whatever those fields already held.
  const [payMode, setPayMode] = useState<"HOURLY" | "SALARY" | "OFFSHORE">(
    initial.isOffshore ? "OFFSHORE" : initial.payType === "SALARY" ? "SALARY" : "HOURLY"
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk("");
    const fd = new FormData(e.currentTarget);

    const payload: Record<string, unknown> = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      email: fd.get("email") || null,
      phone: fd.get("phone") || null,
      address: fd.get("address") || null,
      dateOfBirth: fd.get("dateOfBirth") || null,
      role: fd.get("role") || null,
      status: fd.get("status"),
      hireDate: fd.get("hireDate") || null,
      notes: fd.get("notes") || null,
      isOffshore: payMode === "OFFSHORE",
      offshoreMonthlyRate: payMode === "OFFSHORE" ? (fd.get("offshoreMonthlyRate") || null) : null,
    };
    // payType/hourlyPay/annualSalary are only sent for Hourly/Salary. For
    // Offshore they're left out of the payload entirely so the PATCH
    // endpoint (which skips any field not present in the body) leaves
    // whatever those already held untouched.
    if (payMode !== "OFFSHORE") {
      payload.payType = payMode;
      payload.hourlyPay = fd.get("hourlyPay") || null;
      payload.annualSalary = payMode === "SALARY" ? (fd.get("annualSalary") || null) : null;
    }

    try {
      const res = await fetch(`/api/erp/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        setLoading(false);
        return;
      }
      setOk("Profile updated.");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Permanently delete this employee? This cannot be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/employees/${employeeId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Delete failed");
        setDeleting(false);
        return;
      }
      router.push("/erp/employees");
    } catch {
      setError("Network error");
      setDeleting(false);
    }
  }

  const hireDate = initial.hireDate ? initial.hireDate.slice(0, 10) : "";
  const hourlyPay = initial.hourlyPayCents != null ? (initial.hourlyPayCents / 100).toFixed(2) : "";
  const annualSalary = initial.annualSalaryCents != null ? (initial.annualSalaryCents / 100).toFixed(2) : "";
  const offshoreMonthlyRate = initial.offshoreMonthlyRateCents != null ? (initial.offshoreMonthlyRateCents / 100).toFixed(2) : "";

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-sm font-semibold text-gray-800">General information</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="firstName">
              First name
            </label>
            <input id="firstName" name="firstName" required defaultValue={initial.firstName} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="lastName">
              Last name
            </label>
            <input id="lastName" name="lastName" required defaultValue={initial.lastName} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" defaultValue={initial.email ?? ""} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">
              Phone
            </label>
            <input id="phone" name="phone" defaultValue={initial.phone ?? ""} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="dateOfBirth">
              Date of birth
            </label>
            <input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={initial.dateOfBirth ?? ""} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="address">
              Address
            </label>
            <input id="address" name="address" defaultValue={initial.address ?? ""} placeholder="Street, City, State, ZIP" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="role">
              Role
            </label>
            <input id="role" name="role" defaultValue={initial.role ?? ""} className={input} />
          </div>
          {canSeePay && (
            <div>
              <label className={label}>Pay type</label>
              <div className="mt-1 flex rounded-md border border-gray-300 overflow-hidden text-sm">
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
            </div>
          )}
          {canSeePay && (
            <div>
              {payMode === "HOURLY" ? (
                <>
                  <label className={label} htmlFor="hourlyPay">Hourly pay</label>
                  <input id="hourlyPay" name="hourlyPay" type="number" min="0" step="0.01" defaultValue={hourlyPay} className={input} placeholder="e.g. 18.75" />
                </>
              ) : payMode === "SALARY" ? (
                <>
                  <label className={label} htmlFor="annualSalary">Annual salary</label>
                  <input id="annualSalary" name="annualSalary" type="number" min="0" step="0.01" defaultValue={annualSalary} className={input} placeholder="e.g. 50000" />
                </>
              ) : (
                <>
                  <label className={label} htmlFor="offshoreMonthlyRate">Fixed monthly rate</label>
                  <input id="offshoreMonthlyRate" name="offshoreMonthlyRate" type="number" min="0" step="0.01" defaultValue={offshoreMonthlyRate} className={input} placeholder="e.g. 1200.00" />
                </>
              )}
            </div>
          )}
          {canSeePay && payMode === "SALARY" && (
            <div>
              <label className={label} htmlFor="hourlyPay">Est. hourly rate (for labor cost tracking)</label>
              <input id="hourlyPay" name="hourlyPay" type="number" min="0" step="0.01" defaultValue={hourlyPay} className={input} placeholder="e.g. 24.04" />
            </div>
          )}
          {canSeePay && payMode === "OFFSHORE" && (
            <p className="sm:col-span-2 -mt-2 text-xs text-gray-500">
              Paid a fixed amount every month via the Offshore Payroll tab, not tied to logged hours.
            </p>
          )}
          <div>
            <label className={label} htmlFor="status">
              Status
            </label>
            <select id="status" name="status" defaultValue={initial.status} className={input}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="hireDate">
              Hire date
            </label>
            <input id="hireDate" name="hireDate" type="date" defaultValue={hireDate} className={input} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="notes">
            Notes
          </label>
          <textarea id="notes" name="notes" rows={3} defaultValue={initial.notes ?? ""} className={input} />
        </div>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {ok ? <p className="text-xs text-emerald-600">{ok}</p> : null}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || deleting}
            className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save profile"}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={loading || deleting}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete employee"}
          </button>
        </div>
      </form>
    </section>
  );
}