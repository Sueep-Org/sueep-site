import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { QualityCheckProfileEditor } from "../QualityCheckProfileEditor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

function normalizeEvidencePhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export default async function QualityCheckDetailPage({ params }: PageProps) {
  const { id } = await params;
  const check = await prisma.qualityCheck.findUnique({
    where: { id },
    include: { turnoverRequest: { include: { building: true } } },
  });

  if (!check) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/quality-checks" className="text-xs text-pink-600 hover:underline">
          ← Quality checks
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Quality check for {check.turnoverRequest.building.name}</h1>
        <p className="mt-1 text-sm text-gray-600">Review supervisor signoff, approval, and evidence photos.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <QualityCheckProfileEditor
            checkId={check.id}
            initial={{
              turnoverRequestId: check.turnoverRequestId,
              supervisorName: check.supervisorName,
              supervisorSignatureUrl: check.supervisorSignatureUrl,
              pmApproval: check.pmApproval,
              evidencePhotos: normalizeEvidencePhotos(check.evidencePhotos),
              notes: check.notes,
            }}
          />
        </div>

        <aside className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
          <h2 className="text-sm font-semibold text-gray-900">Check summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-gray-600">Turnover request</dt>
              <dd>{check.turnoverRequest.building.name} • {check.turnoverRequest.requestType}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Supervisor</dt>
              <dd>{check.supervisorName}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">PM approval</dt>
              <dd>{check.pmApproval ? "Approved" : "Not approved"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Signature</dt>
              <dd>
                {check.supervisorSignatureUrl ? (
                  <a href={check.supervisorSignatureUrl} target="_blank" rel="noreferrer" className="text-pink-600 hover:underline">
                    View signature
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Evidence photos</dt>
              <dd>{Array.isArray(check.evidencePhotos) ? check.evidencePhotos.length : 0}</dd>
            </div>
            {check.notes ? (
              <div>
                <dt className="font-semibold text-gray-600">Notes</dt>
                <dd className="whitespace-pre-wrap">{check.notes}</dd>
              </div>
            ) : null}
          </dl>
        </aside>
      </div>
    </div>
  );
}
