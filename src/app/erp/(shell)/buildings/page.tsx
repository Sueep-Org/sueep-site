import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewBuildingForm } from "./NewBuildingForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function BuildingsPage() {
  const buildings = await prisma.building.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Buildings</h1>
          <p className="mt-1 text-sm text-gray-600">
            Track buildings in the system and manage property manager contact details.
          </p>
        </div>
        <NewBuildingForm />
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">PM name</th>
                <th className="px-4 py-3">PM email</th>
                <th className="px-4 py-3">PM phone</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {buildings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No buildings added yet.
                  </td>
                </tr>
              ) : (
                buildings.map((building) => (
                  <tr key={building.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{building.name}</td>
                    <td className="px-4 py-3 text-gray-900">{building.address}</td>
                    <td className="px-4 py-3 text-gray-900">{building.pmName || "—"}</td>
                    <td className="px-4 py-3 text-gray-900">{building.pmEmail || "—"}</td>
                    <td className="px-4 py-3 text-gray-900">{building.pmPhone || "—"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/erp/buildings/${building.id}`}
                        className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500"
                      >
                        Edit
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
