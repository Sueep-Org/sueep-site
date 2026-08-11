"use client";

import { useState } from "react";
import { inputClass, labelClass } from "@/app/erp/components/ui";

const input = inputClass.md;
const label = labelClass.default;

type Props = {
  contractorId: string;
  initial: {
    contractorFullName: string | null;
    phone: string | null;
    address: string | null;
    dateOfBirth: string | null;
  };
};

/** Personal contact info collected from the contractor (their legal name for
 * tax/paperwork purposes, distinct from Contractor.name which is the
 * business name shown everywhere else) — same always-visible, always-editable
 * card style as EmployeeProfileEditor, instead of hiding these fields behind
 * an "Enter manually" toggle. */
export function ContractorContactInfoSection({ contractorId, initial }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk("");
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractorFullName: fd.get("contractorFullName") || null,
          phone: fd.get("phone") || null,
          address: fd.get("address") || null,
          dateOfBirth: fd.get("dateOfBirth") || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setOk("Saved.");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const dateOfBirth = initial.dateOfBirth ? initial.dateOfBirth.slice(0, 10) : "";

  return (
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="contractorFullName">
              Full legal name
            </label>
            <input id="contractorFullName" name="contractorFullName" defaultValue={initial.contractorFullName ?? ""} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">
              Phone
            </label>
            <input id="phone" name="phone" defaultValue={initial.phone ?? ""} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="address">
              Address
            </label>
            <textarea id="address" name="address" rows={2} defaultValue={initial.address ?? ""} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="dateOfBirth">
              Date of birth
            </label>
            <input id="dateOfBirth" name="dateOfBirth" type="date" defaultValue={dateOfBirth} className={input} />
          </div>
        </div>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {ok ? <p className="text-xs text-emerald-600">{ok}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save personal info"}
        </button>
      </form>
  );
}
