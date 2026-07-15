import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewTurnoverRequestForm } from "./NewTurnoverRequestForm";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RequestWithBuilding = Prisma.TurnoverRequestGetPayload<{ include: { building: true } }>;

function formatBuildingTitle(building: RequestWithBuilding["building"]) {
  return [building.name, building.builder, building.address].filter(Boolean).join(" - ");
}

function formatTurnoverInfo(request: RequestWithBuilding) {
  const unit =
    request.unitNumber ? `Cleaning ${request.unitNumber}` : request.requestType === "TURNOVER" ? "Turnover request" : "Regular service";
  const services = [
    request.fullClean ? "Full clean" : null,
    request.fullPaint ? "Full paint" : null,
    request.touchUpPaint ? `${request.touchUpPaint} touch-up` : null,
    request.carpetCleaning ? "Carpet" : null,
    request.materialsAdditional ? "Materials" : null,
    request.ceilingPaint ? "Ceiling paint" : null,
  ].filter(Boolean);
  return services.length ? `${unit} - ${services.join(", ")}` : unit;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
    ASSIGNED: "bg-sky-50 text-sky-700 ring-sky-200",
    IN_PROGRESS: "bg-blue-50 text-blue-700 ring-blue-200",
    QUALITY_CHECK: "bg-violet-50 text-violet-700 ring-violet-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    APPROVED: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[status] ?? "bg-gray-100 text-gray-700 ring-gray-200"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function groupByBuilding(requests: RequestWithBuilding[]) {
  const groups = new Map<string, { building: RequestWithBuilding["building"]; requests: RequestWithBuilding[] }>();
  for (const request of requests) {
    const group = groups.get(request.buildingId);
    if (group) {
      group.requests.push(request);
    } else {
      groups.set(request.buildingId, { building: request.building, requests: [request] });
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.building.name.localeCompare(b.building.name));
}

export default async function TurnoverRequestsPage() {
  let requests: RequestWithBuilding[] = [];

  try {
    requests = await prisma.turnoverRequest.findMany({
      orderBy: [{ building: { name: "asc" } }, { createdAt: "desc" }],
      include: { building: true },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-4 rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800">
        <h1 className="text-lg font-semibold text-red-900">ERP database unavailable</h1>
        <p className="text-red-700">
          The turnover requests page could not reach PostgreSQL. Set <code className="text-red-900">DATABASE_URL</code>, run the Prisma
          migrations, then redeploy.
        </p>
        <p className="text-xs text-red-600">Details: {msg}</p>
      </div>
    );
  }

  const buildingGroups = groupByBuilding(requests);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Turnover Requests</h1>
          <p className="mt-1 text-sm text-gray-600">Buildings stay expanded so PMs, supervisors, and laborers can jump straight into the work.</p>
        </div>
        <NewTurnoverRequestForm />
      </div>

      <section className="space-y-3">
        {buildingGroups.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">No turnover requests yet.</div>
        ) : (
          buildingGroups.map((group) => (
            <details key={group.building.id} open className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 bg-gray-50 px-4 py-3 hover:bg-gray-100">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{formatBuildingTitle(group.building)}</h2>
                  <p className="mt-0.5 text-xs text-gray-500">{group.requests.length} turnover request{group.requests.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/erp/buildings/${group.building.id}`} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-gray-400">
                    Pricing package
                  </Link>
                  <span className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white">Open building</span>
                </div>
              </summary>
              <div className="divide-y divide-gray-100">
                {group.requests.map((request) => (
                  <Link
                    key={request.id}
                    href={`/erp/turnover-requests/${request.id}`}
                    className="grid gap-3 px-4 py-3 text-sm hover:bg-gray-50 md:grid-cols-[minmax(0,1fr)_140px_120px_120px]"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{formatTurnoverInfo(request)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {request.startDate ? request.startDate.toISOString().split("T")[0] : "No start date"} to{" "}
                        {request.endDate ? request.endDate.toISOString().split("T")[0] : "open end"}
                      </p>
                    </div>
                    <div>{statusBadge(request.status)}</div>
                    <div className="font-medium text-gray-900">{request.priceCents != null ? `$${(request.priceCents / 100).toFixed(0)}` : "No price"}</div>
                    <div className="text-xs font-medium text-gray-600">{request.pmSignedAt ? "Signed" : "Needs signature"}</div>
                  </Link>
                ))}
              </div>
            </details>
          ))
        )}
      </section>
    </div>
  );
}
