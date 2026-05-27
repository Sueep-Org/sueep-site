"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CollapsiblePanel } from "@/app/erp/components/CollapsiblePanel";

export type SigningState = {
  signingStatus: string | null;
  contractPdfFilename: string | null;
  docusealTemplateId: number | null;
  customerEmail: string | null;
  signedAt: string | null;
  signedDocumentUrl: string | null;
};

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

export function ChangeOrderSigningSection({
  projectId,
  changeOrderId,
  initial,
}: {
  projectId: string;
  changeOrderId: string;
  initial: SigningState;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<SigningState>(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [sendEmail, setSendEmail] = useState(state.customerEmail ?? "");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `/api/erp/projects/${projectId}/change-orders/${changeOrderId}/contract`,
        { method: "POST", body: fd }
      );
      const text = await res.text();
      let data: { templateId?: number; error?: string } = {};
      try { data = JSON.parse(text); } catch { setUploadError(`Server error: ${text.slice(0, 200)}`); return; }
      if (!res.ok) { setUploadError(data.error ?? "Upload failed"); return; }
      setState((s) => ({
        ...s,
        signingStatus: "UPLOADED",
        contractPdfFilename: file.name,
        docusealTemplateId: data.templateId!,
        signedAt: null,
        signedDocumentUrl: null,
      }));
      router.refresh();
    } catch {
      setUploadError("Network error — please try again");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleRemoveContract() {
    if (!confirm("Remove the uploaded contract?")) return;
    const res = await fetch(
      `/api/erp/projects/${projectId}/change-orders/${changeOrderId}/contract`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setState({ signingStatus: null, contractPdfFilename: null, docusealTemplateId: null, customerEmail: null, signedAt: null, signedDocumentUrl: null });
      router.refresh();
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendError("");
    setSending(true);
    try {
      const res = await fetch(
        `/api/erp/projects/${projectId}/change-orders/${changeOrderId}/send-for-signing`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ customerEmail: sendEmail }),
        }
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) { setSendError(data.error ?? "Failed to send"); return; }
      setState((s) => ({ ...s, signingStatus: "SENT", customerEmail: sendEmail }));
      router.refresh();
    } catch {
      setSendError("Network error — please try again");
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    if (!confirm("Resend the signing request to the customer?")) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch(
        `/api/erp/projects/${projectId}/change-orders/${changeOrderId}/send-for-signing`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ customerEmail: state.customerEmail }),
        }
      );
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setSendError(d.error ?? "Resend failed");
      }
    } finally {
      setSending(false);
    }
  }

  // ── SIGNED ───────────────────────────────────────────────────────────────
  if (state.signingStatus === "SIGNED") {
    return (
      <CollapsiblePanel title="Contract Signing" defaultOpen>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-green-100 text-green-700">
              Signed
            </span>
            <span className="text-xs text-gray-500">
              {state.signedAt ? new Date(state.signedAt).toLocaleDateString("en-US") : "—"}
              {state.customerEmail ? ` · ${state.customerEmail}` : ""}
            </span>
          </div>
          {state.signedDocumentUrl && (
            <a
              href={state.signedDocumentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs font-medium text-pink-600 hover:underline"
            >
              Download signed document →
            </a>
          )}
        </div>
      </CollapsiblePanel>
    );
  }

  // ── SENT ──────────────────────────────────────────────────────────────────
  if (state.signingStatus === "SENT") {
    return (
      <CollapsiblePanel title="Contract Signing" defaultOpen>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-blue-100 text-blue-700">
              Awaiting Signature
            </span>
            <span className="text-xs text-gray-500">
              Sent to <span className="font-medium text-gray-700">{state.customerEmail}</span>
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            The page will update automatically once the customer signs.
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={sending}
            className="mt-3 text-xs font-medium text-pink-600 hover:underline disabled:opacity-50"
          >
            {sending ? "Sending…" : "Resend request"}
          </button>
          {sendError && <p className="mt-1 text-xs text-red-400" role="alert">{sendError}</p>}
        </div>
      </CollapsiblePanel>
    );
  }

  // ── UPLOADED (place fields in DocuSeal + send) ────────────────────────────
  if (state.signingStatus === "UPLOADED") {
    return (
      <CollapsiblePanel title="Contract Signing" defaultOpen>
        {/* Contract file row */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Uploaded Contract</h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-800">{state.contractPdfFilename}</p>
            <div className="flex items-center gap-3">
              {state.docusealTemplateId && (
                <a
                  href={`https://app.docuseal.com/templates/${state.docusealTemplateId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500"
                >
                  Place Signature Fields →
                </a>
              )}
              <button
                type="button"
                onClick={handleRemoveContract}
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Open DocuSeal to drag a signature field onto the contract, then send it to the customer below.
          </p>
        </div>

        {/* Send form */}
        <form onSubmit={handleSend} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Send for Signing</h2>
          <p className="mt-1 text-xs text-gray-500">
            The customer will receive an email with a secure link to review and sign the contract.
          </p>
          <div className="mt-3">
            <label className={label} htmlFor="co-customer-email">Customer email *</label>
            <input
              id="co-customer-email"
              type="email"
              required
              className={input}
              placeholder="customer@example.com"
              value={sendEmail}
              onChange={(e) => setSendEmail(e.target.value)}
            />
          </div>
          {sendError && <p className="mt-2 text-xs text-red-400" role="alert">{sendError}</p>}
          <button
            type="submit"
            disabled={sending}
            className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send for Signing"}
          </button>
        </form>
      </CollapsiblePanel>
    );
  }

  // ── NO CONTRACT YET ───────────────────────────────────────────────────────
  return (
    <CollapsiblePanel title="Contract Signing" defaultOpen={false}>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Upload Contract</h2>
        <p className="mt-1 text-xs text-gray-500">
          Upload the contract PDF, place the customer&apos;s signature field in DocuSeal, then send it for signing via email.
        </p>
        <div className="mt-4">
          <label
            htmlFor="co-contract-upload"
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
          >
            {uploading ? "Uploading…" : "Upload PDF"}
          </label>
          <input
            id="co-contract-upload"
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={uploading}
            onChange={handleUpload}
          />
          {uploadError && <p className="mt-2 text-xs text-red-400" role="alert">{uploadError}</p>}
        </div>
      </div>
    </CollapsiblePanel>
  );
}
