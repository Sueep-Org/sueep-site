"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CollapsiblePanel } from "@/app/erp/components/CollapsiblePanel";

export type ContractItem = {
  id: string;
  contractPdfFilename: string | null;
  docusealTemplateId: number | null;
  signingStatus: string | null;
  customerEmail: string | null;
  signedAt: string | null;
  signedDocumentUrl: string | null;
};

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

function StatusBadge({ status }: { status: string | null }) {
  if (status === "SIGNED")
    return <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-green-100 text-green-700">Signed</span>;
  if (status === "SENT")
    return <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-blue-100 text-blue-700">Awaiting Signature</span>;
  if (status === "UPLOADED")
    return <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-yellow-100 text-yellow-700">Uploaded</span>;
  return null;
}

function ContractRow({
  contract,
  projectId,
  changeOrderId,
  onUpdate,
  onRemove,
}: {
  contract: ContractItem;
  projectId: string;
  changeOrderId: string;
  onUpdate: (id: string, patch: Partial<ContractItem>) => void;
  onRemove: (id: string) => void;
}) {
  const [sendEmail, setSendEmail] = useState(contract.customerEmail ?? "");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [showSendForm, setShowSendForm] = useState(false);

  const base = `/api/erp/projects/${projectId}/change-orders/${changeOrderId}/contracts/${contract.id}`;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSendError("");
    setSending(true);
    try {
      const res = await fetch(`${base}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerEmail: sendEmail }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) { setSendError(data.error ?? "Failed to send"); return; }
      onUpdate(contract.id, { signingStatus: "SENT", customerEmail: sendEmail });
      setShowSendForm(false);
    } catch {
      setSendError("Network error — please try again");
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    if (!confirm("Resend the signing request?")) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch(`${base}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customerEmail: contract.customerEmail }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setSendError(d.error ?? "Resend failed");
      }
    } finally {
      setSending(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remove this contract?")) return;
    const res = await fetch(base, { method: "DELETE" });
    if (res.ok) onRemove(contract.id);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={contract.signingStatus} />
          <span className="text-sm text-gray-800">{contract.contractPdfFilename}</span>
          {contract.customerEmail && contract.signingStatus !== "UPLOADED" && (
            <span className="text-xs text-gray-500">· {contract.customerEmail}</span>
          )}
          {contract.signedAt && (
            <span className="text-xs text-gray-500">
              · {new Date(contract.signedAt).toLocaleDateString("en-US")}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {contract.signingStatus === "SIGNED" && contract.signedDocumentUrl && (
            <a
              href={contract.signedDocumentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-pink-600 hover:underline"
            >
              Download →
            </a>
          )}
          {contract.signingStatus === "UPLOADED" && contract.docusealTemplateId && (
            <a
              href={`https://docuseal.com/templates/${contract.docusealTemplateId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500"
            >
              Place Signature Fields →
            </a>
          )}
          {contract.signingStatus === "UPLOADED" && (
            <button
              type="button"
              onClick={() => setShowSendForm((v) => !v)}
              className="rounded-md border border-pink-200 px-3 py-1.5 text-xs font-medium text-pink-600 hover:bg-pink-50"
            >
              Send for Signing
            </button>
          )}
          {contract.signingStatus === "SENT" && (
            <button
              type="button"
              onClick={handleResend}
              disabled={sending}
              className="text-xs font-medium text-pink-600 hover:underline disabled:opacity-50"
            >
              {sending ? "Sending…" : "Resend"}
            </button>
          )}
          {contract.signingStatus !== "SIGNED" && (
            <button
              type="button"
              onClick={handleRemove}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Inline send form */}
      {showSendForm && contract.signingStatus === "UPLOADED" && (
        <form onSubmit={handleSend} className="border-t border-gray-200 pt-3 space-y-3">
          <div>
            <label className={label} htmlFor={`email-${contract.id}`}>Customer email *</label>
            <input
              id={`email-${contract.id}`}
              type="email"
              required
              className={input}
              placeholder="customer@example.com"
              value={sendEmail}
              onChange={(e) => setSendEmail(e.target.value)}
            />
          </div>
          {sendError && <p className="text-xs text-red-400" role="alert">{sendError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={sending}
              className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setShowSendForm(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sendError && contract.signingStatus === "SENT" && (
        <p className="text-xs text-red-400" role="alert">{sendError}</p>
      )}
    </div>
  );
}

export function ChangeOrderSigningSection({
  projectId,
  changeOrderId,
  initialContracts,
}: {
  projectId: string;
  changeOrderId: string;
  initialContracts: ContractItem[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [contracts, setContracts] = useState<ContractItem[]>(initialContracts);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function updateContract(id: string, patch: Partial<ContractItem>) {
    setContracts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeContract(id: string) {
    setContracts((cs) => cs.filter((c) => c.id !== id));
    router.refresh();
  }

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
      let data: { contractId?: string; templateId?: number; error?: string } = {};
      try { data = JSON.parse(text); } catch { setUploadError(`Server error: ${text.slice(0, 200)}`); return; }
      if (!res.ok) { setUploadError(data.error ?? "Upload failed"); return; }
      setContracts((cs) => [
        ...cs,
        {
          id: data.contractId!,
          contractPdfFilename: file.name,
          docusealTemplateId: data.templateId!,
          signingStatus: "UPLOADED",
          customerEmail: null,
          signedAt: null,
          signedDocumentUrl: null,
        },
      ]);
      router.refresh();
    } catch {
      setUploadError("Network error — please try again");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const defaultOpen = contracts.length > 0;

  return (
    <CollapsiblePanel title="Contract Signing" defaultOpen={defaultOpen}>
      <div className="space-y-3">
        {contracts.map((contract) => (
          <ContractRow
            key={contract.id}
            contract={contract}
            projectId={projectId}
            changeOrderId={changeOrderId}
            onUpdate={updateContract}
            onRemove={removeContract}
          />
        ))}

        {/* Upload button */}
        <div className={contracts.length > 0 ? "pt-1" : ""}>
          {contracts.length === 0 && (
            <p className="mb-3 text-xs text-gray-500">
              Upload a contract PDF, place the customer&apos;s signature field in DocuSeal, then send it for signing via email.
            </p>
          )}
          <label
            htmlFor="co-contract-upload"
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
          >
            {uploading ? "Uploading…" : contracts.length > 0 ? "+ Upload Another Contract" : "Upload PDF"}
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
