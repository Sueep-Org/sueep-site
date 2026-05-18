"use client";

import { useState } from "react";

type Props = {
  token: string;
  name: string;
  initial: {
    contractorFullName: string | null;
    address: string | null;
    dateOfBirth: string | null;
    ssn: string | null;
    bankAccountType: string | null;
    bankAccountNumber: string | null;
    bankRoutingNumber: string | null;
    phone: string | null;
    hasInsurance: boolean | null;
  };
};

const fieldCls =
  "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]";
const labelCls = "block text-xs font-medium text-gray-600 mb-1";

export function ContractorInfoPortalClient({ token, name, initial }: Props) {
  const [contractorFullName, setContractorFullName] = useState(initial.contractorFullName ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth ?? "");
  const [ssn, setSsn] = useState(initial.ssn ?? "");
  const [bankAccountType, setBankAccountType] = useState(initial.bankAccountType ?? "checking");
  const [bankAccountNumber, setBankAccountNumber] = useState(initial.bankAccountNumber ?? "");
  const [bankRoutingNumber, setBankRoutingNumber] = useState(initial.bankRoutingNumber ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [hasInsurance, setHasInsurance] = useState<boolean | null>(initial.hasInsurance ?? null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(initial.contractorFullName));
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contractorFullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (hasInsurance === null) {
      setError("Please indicate whether you have insurance.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/contractor-info/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractorFullName,
          address: address || null,
          dateOfBirth: dateOfBirth || null,
          ssn: ssn || null,
          bankAccountType,
          bankAccountNumber: bankAccountNumber || null,
          bankRoutingNumber: bankRoutingNumber || null,
          phone: phone || null,
          hasInsurance,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <svg className="mx-auto mb-4 h-10 w-10 text-[#E73C6E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">Contractor Information</h1>
          <p className="mt-2 text-sm text-gray-500">
            Hi {name} — please fill in your information below.
          </p>
        </div>

        {saved && (
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center">
            <p className="text-sm font-medium text-emerald-700">
              Information saved. You can update it below anytime before the link expires.
            </p>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className={labelCls}>Full name *</label>
            <input
              type="text"
              value={contractorFullName}
              onChange={(e) => setContractorFullName(e.target.value)}
              placeholder="Your full legal name"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>Phone number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>Address</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={3}
              placeholder="Street, City, State, ZIP"
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>Date of birth</label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={fieldCls}
            />
          </div>

          <div>
            <label className={labelCls}>Social Security Number (SSN)</label>
            <input
              type="text"
              value={ssn}
              onChange={(e) => setSsn(e.target.value)}
              placeholder="XXX-XX-XXXX"
              className={fieldCls}
            />
          </div>

          <fieldset className="rounded-lg border border-gray-200 p-4 space-y-3">
            <legend className="text-sm font-semibold text-gray-800 px-1">Bank Account Info</legend>

            <div>
              <label className={labelCls}>Account type</label>
              <select
                value={bankAccountType}
                onChange={(e) => setBankAccountType(e.target.value)}
                className={fieldCls}
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Account number</label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="Enter account number"
                className={fieldCls}
              />
            </div>

            <div>
              <label className={labelCls}>Routing number</label>
              <input
                type="text"
                value={bankRoutingNumber}
                onChange={(e) => setBankRoutingNumber(e.target.value)}
                placeholder="Enter routing number"
                className={fieldCls}
              />
            </div>
          </fieldset>

          <div>
            <label className={labelCls}>Do you have insurance? *</label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="hasInsurance"
                  checked={hasInsurance === true}
                  onChange={() => setHasInsurance(true)}
                  className="accent-[#E73C6E]"
                />
                <span className="text-sm text-gray-800">Yes</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="hasInsurance"
                  checked={hasInsurance === false}
                  onChange={() => setHasInsurance(false)}
                  className="accent-[#E73C6E]"
                />
                <span className="text-sm text-gray-800">No</span>
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-[#E73C6E] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Saving…" : saved ? "Update information" : "Submit information"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-gray-400">
          Having trouble? Reply to the email we sent you.
        </p>
      </div>
    </div>
  );
}
