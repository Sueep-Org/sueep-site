import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewLaborAssignmentForm } from "./NewLaborAssignmentForm";
import type { Prisma } from '@prisma/client';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function LaborAssignmentsPage() {
  // Auto-run HubSpot sync on page load
  try {
    await fetch('/api/erp/hubspot/sync', {
      method: 'POST',
      cache: 'no-store',
    });
    console.log('✅ Auto-synced from HubSpot for labor assignments');
  } catch (syncErr) {
    console.error('HubSpot auto-sync failed:', syncErr);
  }

  let assignments: Prisma.LaborAssignmentGetPayload<{
    include: {
      turnoverRequest: { include: { building: true } },
      laborer: true,
    },
  }>[] = [];

  try {
    assignments = await prisma.laborAssignment.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        turnoverRequest: { include: { building: true } },
        laborer: true,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-4 rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800">
        <h1 className="text-lg font-semibold text-red-900">ERP database unavailable</h1>
        <p className="text-red-700">
          The labor assignments page could not reach PostgreSQL. On Vercel, set <code className="text-red-900">DATABASE_URL</code> to a
          hosted database (e.g. Neon), run <code className="text-red-900">prisma migrate deploy</code> on deploy (already
          in <code className="text-red-900">npm run build</code>), then redeploy.
        </p>
        <p className="text-xs text-red-600">Details: {msg}</p>
        <p className="mt-4 text-xs">Auto-sync from HubSpot was attempted on page load.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Labor assignments</h1>
          <p className="mt-1 text-sm text-gray-600">
            Track worker assignments connected to turnover requests.
          </p>
        </div>
        <NewLaborAssignmentForm />
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Laborer</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No labor assignments yet.
                  </td>
                </tr>
              ) : (
                assignments.map((assignment) => (
                  <tr key={assignment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {assignment.laborer ? `${assignment.laborer.firstName} ${assignment.laborer.lastName}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{assignment.role || "—"}</td>
                    <td className="px-4 py-3 text-gray-900">
                      {assignment.turnoverRequest.building.name} • {assignment.turnoverRequest.requestType}
                      {assignment.turnoverRequest.unitNumber ? ` • ${assignment.turnoverRequest.unitNumber}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {assignment.assignedDate ? assignment.assignedDate.toISOString().split("T")[0] : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {assignment.startDate ? assignment.startDate.toISOString().split("T")[0] : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {assignment.endDate ? assignment.endDate.toISOString().split("T")[0] : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/erp/labor-assignments/${assignment.id}`}
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
