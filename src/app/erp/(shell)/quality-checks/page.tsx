import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { NewQualityCheckForm } from "./NewQualityCheckForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function QualityChecksPage() {
  let checks: unknown[] = [];

  try {
    checks = await prisma.qualityCheck.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { turnoverRequest: { include: { building: true } } },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-4 rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800">
        <h1 className="text-lg font-semibold text-red-900">ERP database unavailable</h1>
        <p className="text-red-700">
          The quality checks page could not reach PostgreSQL. On Vercel, set <code className="text-red-900">DATABASE_URL</code> to a
          hosted database (e.g. Neon), run <code className="text-red-900">prisma migrate deploy</code> on deploy (already
          in <code className="text-red-900">npm run build</code>), then redeploy.
        </p>
        <p className="text-xs text-red-600">Details: {msg}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Quality checks</h1>
          <p className="mt-1 text-sm text-gray-600">Record inspection signoff and evidence for turnover requests.</p>
        </div>
        <NewQualityCheckForm />
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Supervisor</th>
                <th className="px-4 py-3">PM approval</th>
                <th className="px-4 py-3">Evidence photos</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {checks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No quality checks yet.
                  </td>
                </tr>
              ) : (
                checks.map((check: any) => (
                  <tr key={check.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {check.turnoverRequest.building.name} • {check.turnoverRequest.requestType}
                      {check.turnoverRequest.unitNumber ? ` • ${check.turnoverRequest.unitNumber}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{check.supervisorName}</td>
                    <td className="px-4 py-3 text-gray-900">{check.pmApproval ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-gray-900">{Array.isArray(check.evidencePhotos) ? check.evidencePhotos.length : 0}</td>
                    <td className="px-4 py-3 text-gray-900">{check.notes ? check.notes.slice(0, 60) : "—"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/erp/quality-checks/${check.id}`}
                        className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
