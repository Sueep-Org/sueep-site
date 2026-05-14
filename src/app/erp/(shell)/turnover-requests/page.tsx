import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewTurnoverRequestForm } from "./NewTurnoverRequestForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TurnoverRequestsPage() {
  let requests: unknown[] = [];

  try {
    requests = await prisma.turnoverRequest.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { building: true },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-4 rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800">
        <h1 className="text-lg font-semibold text-red-900">ERP database unavailable</h1>
        <p className="text-red-700">
          The turnover requests page could not reach PostgreSQL. On Vercel, set <code className="text-red-900">DATABASE_URL</code> to a
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
          <h1 className="text-2xl font-semibold text-gray-900">Turnover Requests</h1>
          <p className="mt-1 text-sm text-gray-600">
            Track turnover and regular service requests for managed buildings.
          </p>
        </div>
        <NewTurnoverRequestForm />
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Request type</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">End</th>
                <th className="px-4 py-3">Created by</th>
                <th className="px-4 py-3">Services</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No turnover requests yet.
                  </td>
                </tr>
              ) : (
                requests.map((request: any) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{request.building.name}</td>
                    <td className="px-4 py-3 text-gray-900">{request.requestType}</td>
                    <td className="px-4 py-3 text-gray-900">{request.unitNumber || "—"}</td>
                    <td className="px-4 py-3 text-gray-900">{request.priceCents != null ? `$${(request.priceCents / 100).toFixed(0)}` : "—"}</td>
                    <td className="px-4 py-3 text-gray-900">{request.status}</td>
                    <td className="px-4 py-3 text-gray-900">{request.startDate ? request.startDate.toISOString().split("T")[0] : "—"}</td>
                    <td className="px-4 py-3 text-gray-900">{request.endDate ? request.endDate.toISOString().split("T")[0] : "—"}</td>
                    <td className="px-4 py-3 text-gray-900">{request.createdBy || "—"}</td>
                    <td className="px-4 py-3 text-gray-900">
                      {request.fullPaint ? "Full paint, " : ""}
                      {request.touchUpPaint ? `${request.touchUpPaint} touch-up, ` : ""}
                      {request.fullClean ? "Full clean, " : ""}
                      {request.carpetCleaning ? "Carpet, " : ""}
                      {request.materialsAdditional ? "Additional materials" : ""}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/erp/turnover-requests/${request.id}`}
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
