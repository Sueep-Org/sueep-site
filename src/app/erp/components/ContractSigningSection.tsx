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
        {uploadError && <p className="mt-2 text-xs text-red-400" role="alert">{uploadError}</p>}

        {!uploading && (
          <>
            {/* Pre-signed upload */}
            {showPresigned ? (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                <p className="text-xs font-medium text-gray-700">Upload already-signed contract</p>
                <div>
                  <input
                    ref={presignedFileRef}
                    type="file"
                    accept="application/pdf"
                    className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-pink-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-pink-700 hover:file:bg-pink-100"
                    onChange={(e) => { setPresignedFile(e.target.files?.[0] ?? null); setPresignedError(""); }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Signed on (optional)</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
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
                    className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                  >
                    {presignedUploading ? "Uploading…" : "Save signed contract"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowPresigned(false); setPresignedFile(null); setPresignedDate(""); setPresignedError(""); }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPresigned(true)}
                className="mt-4 block text-xs text-gray-500 hover:text-gray-700 hover:underline"
              >
                Already signed? Upload here →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
