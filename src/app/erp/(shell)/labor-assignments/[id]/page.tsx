import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LaborAssignmentProfileEditor } from "../LaborAssignmentProfileEditor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

export default async function LaborAssignmentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const assignment = await prisma.laborAssignment.findUnique({
    where: { id },
    include: {
      turnoverRequest: { include: { building: true } },
      laborer: true,
    },
  });

  if (!assignment) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/labor-assignments" className="text-xs text-pink-600 hover:underline">
          ← Labor assignments
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          {assignment.laborer ? `${assignment.laborer.firstName} ${assignment.laborer.lastName}` : "Labor assignment"}
        </h1>
        <p className="mt-1 text-sm text-gray-600">Edit assignment details and scheduled dates.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <LaborAssignmentProfileEditor
            assignmentId={assignment.id}
            initial={{
              turnoverRequestId: assignment.turnoverRequestId,
              laborerId: assignment.laborerId,
              role: assignment.role,
              assignedDate: assignment.assignedDate ? assignment.assignedDate.toISOString().split("T")[0] : null,
              startDate: assignment.startDate ? assignment.startDate.toISOString().split("T")[0] : null,
              endDate: assignment.endDate ? assignment.endDate.toISOString().split("T")[0] : null,
              materialsUsed: Array.isArray(assignment.materialsUsed) ? (assignment.materialsUsed as string[]) : [],
              notes: assignment.notes,
            }}
          />
        </div>

        <aside className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
          <h2 className="text-sm font-semibold text-gray-900">Assignment summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-gray-600">Laborer</dt>
              <dd>{assignment.laborer ? `${assignment.laborer.firstName} ${assignment.laborer.lastName}` : "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Turnover request</dt>
              <dd>{assignment.turnoverRequest.building.name} • {assignment.turnoverRequest.requestType}{assignment.turnoverRequest.unitNumber ? ` • ${assignment.turnoverRequest.unitNumber}` : ""}</dd>
            </div>
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
              <dt className="font-semibold text-gray-600">Materials used</dt>
              <dd>{Array.isArray(assignment.materialsUsed) ? (assignment.materialsUsed as string[]).join(", ") : "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Notes</dt>
              <dd className="whitespace-pre-wrap">{assignment.notes || "—"}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
