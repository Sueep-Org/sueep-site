import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContractorAssignmentProfileEditor } from "../ContractorAssignmentProfileEditor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

export default async function ContractorAssignmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const assignment = await prisma.contractorAssignment.findUnique({
    where: { id },
    include: {
      contractor: true,
      building: true,
      project: true,
    },
  });

  if (!assignment) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/contractor-assignments" className="text-xs text-gray-500 hover:underline">
          ← Contractor assignments
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          {assignment.contractor.name}
        </h1>
        <p className="mt-1 text-sm text-gray-600">Edit assignment details and scheduled dates.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <ContractorAssignmentProfileEditor
            assignmentId={assignment.id}
            initial={{
              contractorId: assignment.contractorId,
              buildingId: assignment.buildingId,
              role: assignment.role,
              assignedDate: assignment.assignedDate ? assignment.assignedDate.toISOString().split("T")[0] : null,
              startDate: assignment.startDate ? assignment.startDate.toISOString().split("T")[0] : null,
              endDate: assignment.endDate ? assignment.endDate.toISOString().split("T")[0] : null,
              notes: assignment.notes,
              costCents: assignment.costCents,
            }}
          />
        </div>

        <aside className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
          <h2 className="text-sm font-semibold text-gray-900">Assignment summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-gray-600">Contractor</dt>
              <dd>{assignment.contractor.name}</dd>
            </div>
            {assignment.building ? (
              <div>
                <dt className="font-semibold text-gray-600">Building</dt>
                <dd>{assignment.building.name}</dd>
              </div>
            ) : null}
            {assignment.project ? (
              <div>
                <dt className="font-semibold text-gray-600">Project</dt>
                <dd>
                  <Link href={`/erp/projects/${assignment.project.id}`} className="text-gray-600 hover:underline">
                    {assignment.project.jobTitle}
                  </Link>
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="font-semibold text-gray-600">Role</dt>
              <dd>{assignment.role || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Assigned date</dt>
              <dd>{assignment.assignedDate ? assignment.assignedDate.toISOString().split("T")[0] : "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Start date</dt>
              <dd>{assignment.startDate ? assignment.startDate.toISOString().split("T")[0] : "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">End date</dt>
              <dd>{assignment.endDate ? assignment.endDate.toISOString().split("T")[0] : "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Cost</dt>
              <dd>{assignment.costCents != null ? (assignment.costCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Notes</dt>
              <dd className="whitespace-pre-wrap">{assignment.notes || "—"}</dd>
            </div>
            <div className="pt-2">
              <dt className="font-semibold text-gray-600">Contractor profile</dt>
              <dd className="mt-1">
                <Link href={`/erp/contractors/${assignment.contractorId}`} className="text-gray-600 hover:underline">
                  View contractor →
                </Link>
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
