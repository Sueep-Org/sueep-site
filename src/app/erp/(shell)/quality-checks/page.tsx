import { prisma } from "@/lib/prisma";
import { NewQualityCheckForm } from "./NewQualityCheckForm";
import { QualityChecksTable } from "./QualityChecksTable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function QualityChecksPage() {
  try {
    await fetch('/api/erp/hubspot/sync', { method: 'POST', cache: 'no-store' });
  } catch {
    // non-fatal
  }

  try {
    const checks = await prisma.qualityCheck.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        turnoverRequest: { include: { building: true } },
        project: { select: { id: true, jobTitle: true } },
      },
    });

    const rows = checks.map((check) => ({
      id: check.id,
      label: check.turnoverRequest
        ? `${check.turnoverRequest.building.name} • ${check.turnoverRequest.requestType}${check.turnoverRequest.unitNumber ? ` • ${check.turnoverRequest.unitNumber}` : ""}`
        : check.project?.jobTitle ?? "—",
      supervisorName: check.supervisorName,
      pmApproval: check.pmApproval,
      evidencePhotoCount: Array.isArray(check.evidencePhotos) ? check.evidencePhotos.length : 0,
      notes: check.notes ?? null,
    }));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold text-pink-600">Quality checks</h1>
          <NewQualityCheckForm />
        </div>
        <QualityChecksTable checks={rows} />
      </div>
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-4 rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800">
        <h1 className="text-lg font-semibold text-red-900">ERP database unavailable</h1>
        <p className="text-red-700">
          The quality checks page could not reach PostgreSQL. On Vercel, set{" "}
          <code className="text-red-900">DATABASE_URL</code> to a hosted database (e.g. Neon), run{" "}
          <code className="text-red-900">prisma migrate deploy</code> on deploy, then redeploy.
        </p>
        <p className="text-xs text-red-600">Details: {msg}</p>
      </div>
    );
  }
}
