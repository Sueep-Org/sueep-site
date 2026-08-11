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
};

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Just the "send the contractor a secure self-service link" widget — the
 * fields it collects live in their own always-editable sections below
 * (ContractorContactInfoSection, ContractorBankAccountSection,
 * ContractorInsuranceSection, ContractorSsnSection), same split Employee
 * uses. This section only ever deals with the link itself. */
export function ContractorInfoLinkSection({ id, email, infoToken, infoTokenExpiry, resendConfigured, siteUrl }: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sendOk, setSendOk] = useState(false);
  const [sendError, setSendError] = useState("");

  const infoLink = infoToken ? `${siteUrl.replace(/\/$/, "")}/contractor-info/${infoToken}` : null;
  const isExpired = infoTokenExpiry ? new Date(infoTokenExpiry) < new Date() : false;

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
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-sm font-semibold text-gray-800">Info form link</h2>
      <p className="mt-1 text-xs text-gray-500">
        Send a secure link so the contractor can fill in their own contact, bank, and insurance info, or enter it manually in the sections below.
      </p>

      <div className="mt-3 space-y-3">
        {infoLink && !isExpired && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Expires {formatDt(infoTokenExpiry)}</p>
            <a
              href={infoLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all rounded-md bg-white border border-gray-200 px-3 py-2 text-xs text-pink-600 hover:underline"
            >
              {infoLink}
            </a>
          </div>
        )}

        {isExpired && infoToken && <p className="text-xs text-red-400">Info form link expired.</p>}

        {!resendConfigured && (
          <p className="text-xs text-pink-400">
            <span className="font-mono">RESEND_API_KEY</span> is required to email contractors.
          </p>
        )}

        {!email && <p className="text-xs text-amber-500">Add an email address to this contractor before sending.</p>}

        <button
          type="button"
          onClick={() => void sendLink()}
          disabled={sending || !resendConfigured || !email}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {sending ? "Sending…" : infoToken && !isExpired ? "Resend info form link" : "Send info form link"}
        </button>

        {sendOk && <p className="text-xs text-emerald-600">Info form link sent to {email}</p>}
        {sendError && <p className="text-xs text-red-500">{sendError}</p>}
      </div>
    </section>
  );
}
