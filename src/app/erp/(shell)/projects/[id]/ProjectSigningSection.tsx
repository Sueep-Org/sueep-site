"use client";

export type ProjectContractItem = {
  id: string;
  signingStatus: string;
  customerEmail: string | null;
  docusealSubmissionId: number | null;
  signedAt: string | null;
  signedDocumentUrl: string | null;
};

function StatusBadge({ status }: { status: string }) {
  if (status === "SIGNED")
    return <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-green-100 text-green-700">Signed</span>;
  if (status === "SENT")
    return <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-blue-100 text-blue-700">Awaiting Signature</span>;
  return <span className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase bg-yellow-100 text-yellow-700">{status}</span>;
}

export function ProjectSigningSection({ contracts }: { contracts: ProjectContractItem[] }) {
  if (contracts.length === 0) {
    return (
      <p className="text-sm text-gray-500">No signed contracts on file. Contracts are recorded here when signed externally via the request form.</p>
    );
  }

  return (
    <div className="space-y-3">
      {contracts.map((c) => (
        <div key={c.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={c.signingStatus} />
              {c.customerEmail && (
                <span className="text-sm text-gray-700">{c.customerEmail}</span>
              )}
              {c.signedAt && (
                <span className="text-xs text-gray-500">
                  · Signed {new Date(c.signedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {c.docusealSubmissionId && (
                <a
                  href={`https://docuseal.com/submissions/${c.docusealSubmissionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-pink-600 hover:underline"
                >
                  View in DocuSeal →
                </a>
              )}
              {c.signedDocumentUrl && (
                <a
                  href={c.signedDocumentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-pink-600 hover:underline"
                >
                  Download signed copy →
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
