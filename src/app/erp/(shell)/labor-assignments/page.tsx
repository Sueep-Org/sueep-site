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
          <h1 className="text-2xl font-bold text-pink-600">Labor Assignments</h1>
        </div>
        <NewLaborAssignmentForm />
      </div>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-700">
                <th className="px-4 py-3">Laborer</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    No labor assignments yet.
                  </td>
                </tr>
              ) : (
                assignments.map((assignment, i) => (
                  <tr key={assignment.id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100 transition-colors`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {assignment.laborer ? `${assignment.laborer.firstName} ${assignment.laborer.lastName}` : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{assignment.role || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className="font-medium">{assignment.turnoverRequest.building.name}</span>
                      <span className="text-gray-400"> · </span>
                      {assignment.turnoverRequest.requestType}
                      {assignment.turnoverRequest.unitNumber ? (
                        <><span className="text-gray-400"> · </span>{assignment.turnoverRequest.unitNumber}</>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {assignment.assignedDate ? assignment.assignedDate.toISOString().split("T")[0] : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {assignment.startDate ? assignment.startDate.toISOString().split("T")[0] : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {assignment.endDate ? assignment.endDate.toISOString().split("T")[0] : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/erp/labor-assignments/${assignment.id}`}
                        className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-300 transition-colors"
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
