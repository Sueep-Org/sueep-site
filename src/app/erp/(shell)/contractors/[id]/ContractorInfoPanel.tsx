"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  id: string;
  email: string | null;
  infoToken: string | null;
  infoTokenExpiry: string | null;
  resendConfigured: boolean;
  siteUrl: string;
  collectedInfo: {
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

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function maskSsn(ssn: string | null): string {
  if (!ssn) return "—";
  return ssn.length >= 4 ? `***-**-${ssn.slice(-4)}` : "***-**-****";
}

function maskAccount(num: string | null): string {
  if (!num) return "—";
  return num.length > 4 ? `****${num.slice(-4)}` : "****";
}

export function ContractorInfoPanel({
  id,
  email,
  infoToken,
  infoTokenExpiry,
  resendConfigured,
  siteUrl,
  collectedInfo,
}: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sendOk, setSendOk] = useState(false);
  const [sendError, setSendError] = useState("");

  const infoLink = infoToken
    ? `${siteUrl.replace(/\/$/, "")}/contractor-info/${infoToken}`
    : null;
  const isExpired = infoTokenExpiry ? new Date(infoTokenExpiry) < new Date() : false;
  const hasInfo = Boolean(collectedInfo.contractorFullName);

  async function sendLink() {
    setSending(true);
    setSendOk(false);
    setSendError("");
    const res = await fetch(`/api/erp/contractors/${id}/send-info-link`, { method: "POST" });
    setSending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setSendError(j.error ?? "Send failed");
      return;
    }
    setSendOk(true);
    router.refresh();
    setTimeout(() => setSendOk(false), 3000);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          Send the contractor a secure link to fill in their personal information, banking details, and insurance status. No account required — expires after 7 days.
        </p>

        {infoLink && !isExpired && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Expires {formatDt(infoTokenExpiry)}</p>
            <a
              href={infoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all rounded-md bg-gray-100 border border-gray-200 px-3 py-2 text-xs text-[#E73C6E] hover:underline"
            >
              {infoLink}
            </a>
          </div>
        )}

        {isExpired && infoToken && (
          <p className="text-xs text-red-400">Info form link expired.</p>
        )}

        {!resendConfigured && (
          <p className="text-xs text-pink-400">
            <span className="font-mono">RESEND_API_KEY</span> is required to email contractors.
          </p>
        )}

        {!email && (
          <p className="text-xs text-amber-500">Add an email address to this contractor before sending.</p>
        )}

        <button
          type="button"
          onClick={() => void sendLink()}
          disabled={sending || !resendConfigured || !email}
          className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {sending
            ? "Sending…"
            : infoToken && !isExpired
            ? "Resend info form link"
            : "Send info form link"}
        </button>

        {sendOk && <p className="text-xs text-emerald-500">Info form link sent to {email}</p>}
        {sendError && <p className="text-xs text-red-400">{sendError}</p>}
      </div>

      {hasInfo && (
        <div className="border-t border-gray-200 pt-4">
          <p className="text-xs font-medium text-gray-700 mb-3">Submitted information</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-pink-500">Full name</dt>
              <dd className="text-gray-800">{collectedInfo.contractorFullName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">Phone</dt>
              <dd className="text-gray-800">{collectedInfo.phone ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-pink-500">Address</dt>
              <dd className="text-gray-800 whitespace-pre-wrap">{collectedInfo.address ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">Date of birth</dt>
              <dd className="text-gray-800">{collectedInfo.dateOfBirth ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">SSN</dt>
              <dd className="text-gray-800 font-mono">{maskSsn(collectedInfo.ssn)}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">Account type</dt>
              <dd className="text-gray-800 capitalize">{collectedInfo.bankAccountType ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">Account number</dt>
              <dd className="text-gray-800 font-mono">{maskAccount(collectedInfo.bankAccountNumber)}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">Routing number</dt>
              <dd className="text-gray-800 font-mono">{maskAccount(collectedInfo.bankRoutingNumber)}</dd>
            </div>
            <div>
              <dt className="text-xs text-pink-500">Has insurance</dt>
              <dd className={collectedInfo.hasInsurance ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                {collectedInfo.hasInsurance === null ? "—" : collectedInfo.hasInsurance ? "Yes" : "No"}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
