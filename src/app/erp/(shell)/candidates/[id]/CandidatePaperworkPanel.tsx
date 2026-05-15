"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PaperworkItem = { label: string; url: string };

type Props = {
  id: string;
  email: string;
  status: string;
  paperwork: PaperworkItem[];
  paperworkUploadToken: string | null;
  paperworkUploadTokenExpiry: string | null;
  resendConfigured: boolean;
  siteUrl: string;
};

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso)
    );
  } catch {
    return iso;
  }
}

export function CandidatePaperworkPanel({
  id,
  email,
  status,
  paperwork,
  paperworkUploadToken,
  paperworkUploadTokenExpiry,
  resendConfigured,
  siteUrl,
}: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState(false);

  const isOnboarding = status === "ONBOARDING";
  const hasDocuments = paperwork.length > 0;
  const uploadLink = paperworkUploadToken
    ? `${siteUrl.replace(/\/$/, "")}/candidate-portal/${paperworkUploadToken}`
    : null;

  const isExpired =
    paperworkUploadTokenExpiry ? new Date(paperworkUploadTokenExpiry) < new Date() : false;

  const uploadedCount = paperwork.filter((p) => p.url).length;

  async function sendLink() {
    setSending(true);
    setError(null);
    setSendOk(false);
    const res = await fetch(`/api/erp/candidates/${id}/send-upload-link`, { method: "POST" });
    setSending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? `Send failed (${res.status})`);
      return;
    }
    setSendOk(true);
    router.refresh();
    setTimeout(() => setSendOk(false), 3000);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400 leading-relaxed">
        When status is set to Onboarding and documents are configured above, send the candidate a
        secure upload link. No ERP login required — the link expires after 7 days.
      </p>

      {!isOnboarding && (
        <p className="text-sm text-amber-500">
          Set status to <strong>Onboarding</strong> and save before sending the upload link.
        </p>
      )}

      {isOnboarding && !hasDocuments && (
        <p className="text-sm text-amber-500">
          Add at least one required document in the Pipeline section above before sending.
        </p>
      )}

      {isOnboarding && hasDocuments && (
        <>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-pink-500 text-xs">Documents uploaded</dt>
              <dd className="text-zinc-700">
                {uploadedCount} / {paperwork.length}
              </dd>
            </div>
            <div>
              <dt className="text-pink-500 text-xs">Link expires</dt>
              <dd className={isExpired ? "text-red-400" : "text-zinc-700"}>
                {paperworkUploadTokenExpiry ? formatDt(paperworkUploadTokenExpiry) : "Not sent"}
                {isExpired && " (expired)"}
              </dd>
            </div>
          </dl>

          {uploadLink && !isExpired && (
            <div>
              <p className="text-xs text-zinc-500 mb-1">Candidate upload link</p>
              <a
                href={uploadLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block break-all rounded-md bg-gray-200 border border-gray-300 px-3 py-2 text-xs text-[#E73C6E] hover:underline"
              >
                {uploadLink}
              </a>
            </div>
          )}

          <ul className="space-y-1">
            {paperwork.map((item) => (
              <li key={item.label} className="flex items-center justify-between text-xs">
                <span className="text-zinc-700">{item.label}</span>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#E73C6E] hover:underline"
                  >
                    View file
                  </a>
                ) : (
                  <span className="text-amber-500">Pending</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {!resendConfigured && (
        <p className="text-sm text-pink-400">
          <span className="font-mono text-xs">RESEND_API_KEY</span> is required to email
          candidates.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void sendLink()}
          disabled={sending || !isOnboarding || !hasDocuments || !resendConfigured}
          className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {sending
            ? "Sending…"
            : paperworkUploadToken && !isExpired
            ? "Resend upload link"
            : "Send upload link"}
        </button>
      </div>

      {sendOk && <p className="text-sm text-emerald-400">Upload link sent to {email}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
