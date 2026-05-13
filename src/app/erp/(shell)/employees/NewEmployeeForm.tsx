"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewEmployeeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      hourlyPay: fd.get("hourlyPay") || undefined,
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
      >
        {open ? "Close" : "Add employee"}
      </button>
      {open ? (
        <form onSubmit={onSubmit} className="mt-3 w-full max-w-2xl space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="firstName" required placeholder="First name *" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            <input name="lastName" required placeholder="Last name *" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            <input name="email" type="email" placeholder="Email" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            <input name="phone" placeholder="Phone" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            <input name="role" placeholder="Role" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            <input name="hourlyPay" type="number" min="0" step="0.01" placeholder="Hourly pay (e.g. 18.75)" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            <input name="defaultProject" placeholder="Default project" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            <input name="hireDate" type="date" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
            <select name="status" defaultValue="ACTIVE" className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <textarea name="notes" rows={2} placeholder="Notes" className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900" />
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-pink-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save employee"}
          </button>
        </form>
      ) : null}
    </div>
  );
}