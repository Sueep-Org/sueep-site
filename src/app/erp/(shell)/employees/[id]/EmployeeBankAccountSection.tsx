"use client";

import { useState } from "react";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

type Props = {
  employeeId: string;
  initial: {
    bankAccountType: string | null;
    bankAccountNumber: string | null;
    bankRoutingNumber: string | null;
  };
};

export function EmployeeBankAccountSection({ employeeId, initial }: Props) {
  const [accountType, setAccountType] = useState(initial.bankAccountType ?? "checking");
  const [accountNumber, setAccountNumber] = useState(initial.bankAccountNumber ?? "");
  const [routingNumber, setRoutingNumber] = useState(initial.bankRoutingNumber ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk("");

    try {
      const res = await fetch(`/api/erp/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bankAccountType: accountType,
          bankAccountNumber: accountNumber || null,
          bankRoutingNumber: routingNumber || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      setOk("Bank account info updated.");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-sm font-semibold text-gray-800">Bank Account Info</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="bankAccountType">
              Account type
            </label>
            <select
              id="bankAccountType"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className={input}
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="bankAccountNumber">
              Account number
            </label>
            <input
              id="bankAccountNumber"
              name="bankAccountNumber"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className={input}
            />
          </div>
          <div>
            <label className={label} htmlFor="bankRoutingNumber">
              Routing number
            </label>
            <input
              id="bankRoutingNumber"
              name="bankRoutingNumber"
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value)}
              className={input}
            />
          </div>
        </div>
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {ok ? <p className="text-xs text-emerald-600">{ok}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save bank info"}
        </button>
      </form>
    </section>
  );
}
