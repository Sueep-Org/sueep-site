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
    include: {
      turnoverRequest: { include: { building: true } },
      project: { select: { id: true, jobTitle: true } },
      sovItems: { select: { id: true, description: true } },
    },
  });

  if (!check) notFound();

  const displayName = check.turnoverRequest
    ? check.turnoverRequest.building.name
    : check.project?.jobTitle ?? "Unknown";

  // No standalone company-wide quality-checks list anymore — back link goes
  // to the owning project's own Quality Checks tab when there is one, since
  // that's the only place this check is actually reachable from.
  const backHref = check.projectId
    ? `/erp/projects/${check.projectId}?tab=${encodeURIComponent("Quality Checks")}`
    : "/erp/projects";
  const backLabel = check.projectId ? "← Back to project" : "← Projects";

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-xs text-gray-500 hover:underline">
          {backLabel}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Quality check for {displayName}</h1>
        <p className="mt-1 text-sm text-gray-600">Review supervisor signoff, approval, and evidence photos.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <QualityCheckProfileEditor
            checkId={check.id}
            initial={{
              turnoverRequestId: check.turnoverRequestId ?? null,
              projectId: check.projectId ?? null,
              projectName: check.project?.jobTitle ?? null,
              supervisorName: check.supervisorName,
              supervisorSignatureUrl: check.supervisorSignatureUrl,
              pmApproval: check.pmApproval,
              evidencePhotos: normalizeEvidencePhotos(check.evidencePhotos),
              notes: check.notes,
              sovItemIds: check.sovItems.map((s) => s.id),
              scopeDescription: check.scopeDescription,
            }}
          />
        </div>

        <aside className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
          <h2 className="text-sm font-semibold text-gray-900">Check summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-gray-600">
                {check.turnoverRequest ? "Turnover request" : "Project"}
              </dt>
              <dd>
                {check.turnoverRequest
                  ? `${check.turnoverRequest.building.name} • ${check.turnoverRequest.requestType}`
                  : (check.project?.jobTitle ?? "—")}
              </dd>
            </div>
            {check.sovItems.length > 0 ? (
              <div>
                <dt className="font-semibold text-gray-600">SOV item(s)</dt>
                <dd>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {check.sovItems.map((s) => (
                      <li key={s.id}>{s.description}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : check.scopeDescription ? (
              <div>
                <dt className="font-semibold text-gray-600">Scope</dt>
                <dd className="whitespace-pre-wrap">{check.scopeDescription}</dd>
              </div>
            ) : null}
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
                  <a href={check.supervisorSignatureUrl} target="_blank" rel="noreferrer" className="text-gray-600 hover:underline">
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
