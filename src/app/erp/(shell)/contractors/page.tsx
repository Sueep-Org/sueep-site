import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewContractorForm } from "./NewContractorForm";
import { subCoverage, type CoverageItem } from "@/lib/erp/subCoverage";

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };

/** Check when the policy is on file and not expired, X when it's missing or expired. Hover for the date. */
function CoverageCheck({ item }: { item: CoverageItem | undefined }) {
  if (!item) return null;
  if (item.status === "EXEMPT") {
    return <span title="Workers' comp exempt" className="text-xs font-medium text-gray-500">Exempt</span>;
  }
  const date = item.expiresAt ? new Date(`${item.expiresAt}T00:00:00Z`).toLocaleDateString("en-US", SHORT_DATE) : null;
  const look = {
    CURRENT: { mark: "✓", cls: "text-emerald-600", title: `Expires ${date}` },
    EXPIRING: { mark: "✓", cls: "text-amber-600", title: `Expiring ${date}` },
    EXPIRED: { mark: "✗", cls: "text-red-600", title: `Expired ${date}` },
    MISSING: { mark: "✗", cls: "text-gray-400", title: "Not on file" },
  }[item.status];
  return <span title={`${item.label}: ${look.title}`} className={`text-base font-bold ${look.cls}`}>{look.mark}</span>;
}

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
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-center">GL</th>
                <th className="px-4 py-2 text-center">WC</th>
                <th className="px-4 py-2">Added</th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((c, i) => {
                const coverage = subCoverage(c);
                const gl = coverage.items.find((it) => it.key === "gl");
                const wc = coverage.items.find((it) => it.key === "wc");
                return (
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
                  <td className="px-4 py-3 text-gray-700">{c.role || "—"}</td>
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
                  <td className="px-4 py-3 text-center"><CoverageCheck item={gl} /></td>
                  <td className="px-4 py-3 text-center"><CoverageCheck item={wc} /></td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.createdAt.toLocaleDateString()}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
