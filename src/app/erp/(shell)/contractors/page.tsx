import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewContractorForm } from "./NewContractorForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ContractorsPage() {
  const contractors = await prisma.contractor.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <NewContractorForm title={<h1 className="text-2xl font-bold text-pink-600">Contractor Verification</h1>} />
      
      {contractors.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          No contractors yet. Add one above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Added</th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((c, i) => (
                <tr key={c.id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100 transition-colors`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link
                      href={`/erp/contractors/${c.id}`}
                      className="text-gray-800 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="hover:underline">
                        {c.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        c.status === "ACTIVE"
                          ? "bg-gray-200 text-gray-700"
                          : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {c.status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
