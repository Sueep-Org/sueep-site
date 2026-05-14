import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TurnoverRequestProfileEditor } from "../TurnoverRequestProfileEditor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

export default async function TurnoverRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const request = await prisma.turnoverRequest.findUnique({
    where: { id },
    include: { building: true },
  });

  if (!request) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/turnover-requests" className="text-xs text-pink-600 hover:underline">
          ← Turnover requests
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          {request.building.name} {request.unitNumber ? `• ${request.unitNumber}` : ""}
        </h1>
        <p className="mt-1 text-sm text-gray-600">Edit request details, status, and service requirements.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <TurnoverRequestProfileEditor
            requestId={request.id}
            initial={{
              buildingId: request.buildingId,
              requestType: request.requestType,
              unitNumber: request.unitNumber,
              bedrooms: request.bedrooms,
              bathrooms: request.bathrooms,
              fullPaint: request.fullPaint,
              touchUpPaint: request.touchUpPaint,
              fullClean: request.fullClean,
              carpetCleaning: request.carpetCleaning,
              materialsAdditional: request.materialsAdditional,
              startDate: request.startDate ? request.startDate.toISOString().split("T")[0] : null,
              endDate: request.endDate ? request.endDate.toISOString().split("T")[0] : null,
              createdBy: request.createdBy,
              status: request.status,
            }}
          />
        </div>

        <aside className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
          <h2 className="text-sm font-semibold text-gray-900">Request summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-gray-600">Request type</dt>
              <dd>{request.requestType}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Status</dt>
              <dd>{request.status}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Created by</dt>
              <dd>{request.createdBy || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Building</dt>
              <dd>{request.building.name}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Unit</dt>
              <dd>{request.unitNumber || "—"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-600">Dates</dt>
              <dd>{request.startDate ? request.startDate.toISOString().split("T")[0] : "—"} — {request.endDate ? request.endDate.toISOString().split("T")[0] : "—"}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
