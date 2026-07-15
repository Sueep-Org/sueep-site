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
    role: string | null;
    payType: string;
    hourlyPayCents: number | null;
    annualSalaryCents: number | null;
    defaultProject: string | null;
    status: string;
    hireDate: string | null;
    notes: string | null;
  };
};

export function EmployeeProfileEditor({ employeeId, canSeePay = true, initial }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [payType, setPayType] = useState<"HOURLY" | "SALARY">(initial.payType === "SALARY" ? "SALARY" : "HOURLY");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk("");
    const fd = new FormData(e.currentTarget);

    const payload = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      email: fd.get("email") || null,
      phone: fd.get("phone") || null,
      role: fd.get("role") || null,
      payType,
      hourlyPay: fd.get("hourlyPay") || null,
      annualSalary: payType === "SALARY" ? (fd.get("annualSalary") || null) : null,
      defaultProject: fd.get("defaultProject") || null,
      status: fd.get("status"),
      hireDate: fd.get("hireDate") || null,
      notes: fd.get("notes") || null,
    };

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
            </div>
          )}
          {canSeePay && (
            <div>
              {payType === "HOURLY" ? (
                <>
                  <label className={label} htmlFor="hourlyPay">Hourly pay</label>
                  <input id="hourlyPay" name="hourlyPay" type="number" min="0" step="0.01" defaultValue={hourlyPay} className={input} placeholder="e.g. 18.75" />
                </>
              ) : (
                <>
                  <label className={label} htmlFor="annualSalary">Annual salary</label>
                  <input id="annualSalary" name="annualSalary" type="number" min="0" step="0.01" defaultValue={annualSalary} className={input} placeholder="e.g. 50000" />
                </>
              )}
            </div>
          )}
          {canSeePay && payType === "SALARY" && (
            <div>
              <label className={label} htmlFor="hourlyPay">Est. hourly rate (for labor cost tracking)</label>
              <input id="hourlyPay" name="hourlyPay" type="number" min="0" step="0.01" defaultValue={hourlyPay} className={input} placeholder="e.g. 24.04" />
            </div>
          )}
          <div>
            <label className={label} htmlFor="defaultProject">
              Default project
            </label>
            <input id="defaultProject" name="defaultProject" defaultValue={initial.defaultProject ?? ""} className={input} />
          </div>
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