"use client";

import { useState } from "react";

const input =
  "mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-400";

type Props = {
  employeeId: string;
  initial: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    role: string | null;
    hourlyPayCents: number | null;
    defaultProject: string | null;
    status: string;
    hireDate: string | null;
    notes: string | null;
  };
};

export function EmployeeProfileEditor({ employeeId, initial }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

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
      hourlyPay: fd.get("hourlyPay") || null,
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

  const hireDate = initial.hireDate ? initial.hireDate.slice(0, 10) : "";
  const hourlyPay = initial.hourlyPayCents != null ? (initial.hourlyPayCents / 100).toFixed(2) : "";

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-sm font-semibold text-zinc-200">General information</h2>
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
          <div>
            <label className={label} htmlFor="hourlyPay">
              Hourly pay
            </label>
            <input id="hourlyPay" name="hourlyPay" type="number" min="0" step="0.01" defaultValue={hourlyPay} className={input} />
          </div>
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
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        {ok ? <p className="text-xs text-emerald-400">{ok}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save profile"}
        </button>
      </form>
    </section>
  );
}