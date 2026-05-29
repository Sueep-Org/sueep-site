import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewContractorAssignmentForm } from "./NewContractorAssignmentForm";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ContractorAssignmentsPage() {
  let assignments: Prisma.ContractorAssignmentGetPayload<{
    include: {
      contractor: true;
      building: true;
      project: true;
    };
  }>[] = [];

  try {
    assignments = await prisma.contractorAssignment.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        contractor: true,
        building: true,
        project: true,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-4 rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800">
        <h1 className="text-lg font-semibold text-red-900">ERP database unavailable</h1>
        <p className="text-red-700">Details: {msg}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pink-600">Contractor Assignments</h1>
        </div>
        <NewContractorAssignmentForm />
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Contractor</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Location / Project</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                    No contractor assignments yet.
                  </td>
                </tr>
              ) : (
                assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.contractor.name}</td>
                    <td className="px-4 py-3 text-gray-600">{a.role || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {a.building ? (
                        <span className="font-medium">{a.building.name}</span>
                      ) : a.project ? (
                        <Link href={`/erp/projects/${a.project.id}`} className="font-medium text-gray-700 hover:underline">
                          {a.project.jobTitle}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.assignedDate ? a.assignedDate.toISOString().split("T")[0] : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.startDate ? a.startDate.toISOString().split("T")[0] : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {a.endDate ? a.endDate.toISOString().split("T")[0] : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/erp/contractor-assignments/${a.id}`}
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
