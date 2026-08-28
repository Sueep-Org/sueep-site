"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type ContractItem = {
  id: string;
  contractPdfFilename: string | null;
  docusealTemplateId: number | null;
  signingStatus: string | null;
  signerEmail: string | null;
  signedAt: string | null;
  signedDocumentUrl: string | null;
};

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
  apiBasePath,
  onRemove,
}: {
  contract: ContractItem;
  apiBasePath: string;
  onRemove: (id: string) => void;
}) {
  const base = `${apiBasePath}/contracts/${contract.id}`;

  async function handleRemove() {
    if (!confirm("Remove this contract?")) return;
    const res = await fetch(base, { method: "DELETE" });
    if (res.ok) onRemove(contract.id);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={contract.signingStatus} />
          <span className="text-sm text-gray-800">{contract.contractPdfFilename}</span>
          {contract.signerEmail && contract.signingStatus !== "UPLOADED" && (
            <span className="text-xs text-gray-500">· {contract.signerEmail}</span>
          )}
          {contract.signedAt && (
            <span className="text-xs text-gray-500">
              · {new Date(contract.signedAt).toLocaleDateString("en-US")}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {contract.signingStatus === "SIGNED" && contract.signedDocumentUrl && (
            contract.signedDocumentUrl.startsWith("data:") ? (
              <a
                href={contract.signedDocumentUrl}
                download={contract.contractPdfFilename ?? "contract.pdf"}
                className="text-xs font-medium text-pink-600 hover:underline"
              >
                Download →
              </a>
            ) : (
              <a
                href={contract.signedDocumentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-pink-600 hover:underline"
              >
                Download →
              </a>
            )
          )}
          {contract.signingStatus !== "SIGNED" && contract.docusealTemplateId && (
            <a
              href={`https://docuseal.com/templates/${contract.docusealTemplateId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500"
            >
              Open in DocuSeal →
            </a>
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
    </div>
  );
}

export function ContractSigningSection({
  apiBasePath,
  initialContracts,
}: {
  apiBasePath: string;
  initialContracts: ContractItem[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [contracts, setContracts] = useState<ContractItem[]>(initialContracts);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [showPresigned, setShowPresigned] = useState(false);
  const [presignedFile, setPresignedFile] = useState<File | null>(null);
  const [presignedDate, setPresignedDate] = useState("");
  const [presignedUploading, setPresignedUploading] = useState(false);
  const [presignedError, setPresignedError] = useState("");
  const presignedFileRef = useRef<HTMLInputElement>(null);

  const hasPending = contracts.some((c) => c.signingStatus === "SENT");
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(id);
  }, [hasPending, router]);

  function removeContract(id: string) {
    setContracts((cs) => cs.filter((c) => c.id !== id));
    router.refresh();
  }

  async function handlePresignedSubmit() {
    if (!presignedFile) { setPresignedError("Please select a PDF file."); return; }
    setPresignedError("");
    setPresignedUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", presignedFile);
      fd.append("presigned", "true");
      if (presignedDate) fd.append("signedAt", presignedDate);
      const res = await fetch(`${apiBasePath}/contracts`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { contractId?: string; error?: string };
      if (!res.ok) { setPresignedError(data.error ?? "Upload failed"); return; }
      setContracts((cs) => [
        ...cs,
        {
          id: data.contractId!,
          contractPdfFilename: presignedFile.name,
          docusealTemplateId: null,
          signingStatus: "SIGNED",
          signerEmail: null,
          signedAt: presignedDate || new Date().toISOString().slice(0, 10),
          signedDocumentUrl: null,
        },
      ]);
      setShowPresigned(false);
      setPresignedFile(null);
      setPresignedDate("");
      if (presignedFileRef.current) presignedFileRef.current.value = "";
      router.refresh();
    } catch {
      setPresignedError("Upload failed — please try again.");
    } finally {
      setPresignedUploading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${apiBasePath}/contracts`, { method: "POST", body: fd });
      const text = await res.text();
      let data: { contractId?: string; templateId?: number; error?: string } = {};
      try { data = JSON.parse(text); } catch { setUploadError(`Server error: ${text.slice(0, 200)}`); return; }
      if (!res.ok) { setUploadError(data.error ?? "Upload failed"); return; }
      setContracts((cs) => [
        ...cs,
        {
          id: data.contractId!,
          contractPdfFilename: file.name,
          docusealTemplateId: data.templateId ?? null,
          signingStatus: "UPLOADED",
          signerEmail: null,
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

  return (
    <div className="space-y-3">
      {contracts.map((contract) => (
        <ContractRow
          key={contract.id}
          contract={contract}
          apiBasePath={apiBasePath}
          onRemove={removeContract}
        />
      ))}

      <div className={contracts.length > 0 ? "pt-1" : ""}>
        {contracts.length === 0 && (
          <p className="mb-3 text-xs text-gray-500">
            Upload a contract PDF, then handle field placement and sending directly in DocuSeal. Status updates here automatically.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor={`contract-upload-${apiBasePath.replace(/\//g, "-")}`}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
          >
            {uploading ? "Uploading…" : contracts.length > 0 ? "+ Upload Another Contract" : "Upload PDF"}
          </label>
          <input
            id={`contract-upload-${apiBasePath.replace(/\//g, "-")}`}
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={uploading}
            onChange={handleUpload}
          />

          {!uploading && !showPresigned && (
            <button
              type="button"
              onClick={() => setShowPresigned(true)}
              className="inline-flex items-center gap-2 rounded-md border-2 border-green-600 bg-green-50 px-4 py-2 text-sm font-semibold text-green-800 hover:bg-green-100"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
              Already signed? Upload it here
            </button>
          )}
        </div>
        {uploadError && <p className="mt-2 text-xs text-red-400" role="alert">{uploadError}</p>}

        {!uploading && showPresigned && (
          <div className="mt-4 rounded-lg border-2 border-green-200 bg-green-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-green-900">Upload an already-signed contract</p>
            <div>
              <input
                ref={presignedFileRef}
                type="file"
                accept="application/pdf"
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-green-700 hover:file:bg-green-100"
                onChange={(e) => { setPresignedFile(e.target.files?.[0] ?? null); setPresignedError(""); }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Signed on (optional)</label>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                value={presignedDate}
                onChange={(e) => setPresignedDate(e.target.value)}
              />
            </div>
            {presignedError && <p className="text-xs text-red-500" role="alert">{presignedError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={presignedUploading}
                onClick={handlePresignedSubmit}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {presignedUploading ? "Uploading…" : "Save signed contract"}
              </button>
              <button
                type="button"
                onClick={() => { setShowPresigned(false); setPresignedFile(null); setPresignedDate(""); setPresignedError(""); }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
