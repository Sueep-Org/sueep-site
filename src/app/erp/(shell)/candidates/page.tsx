import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CandidateStatusSelect } from "./CandidateStatusSelect";
import { CandidatesFilters } from "./CandidatesFilters";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CandidatesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const search = typeof sp.search === "string" ? sp.search.trim() : "";
  const statusFilter = typeof sp.status === "string" ? sp.status.trim() : "";

  const candidates = await prisma.candidateApplication.findMany({
    where: {
      ...(search ? { fullName: { contains: search, mode: "insensitive" } } : {}),
      // When no status filter is active, hide hired candidates (they are now employees)
      ...(statusFilter ? { status: statusFilter } : { status: { not: "HIRED" } }),
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Candidates</h1>
        <p className="mt-1 text-sm text-gray-500">{candidates.length} application{candidates.length !== 1 ? "s" : ""}</p>
      </div>

      <CandidatesFilters search={search} status={statusFilter} />

      {candidates.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          No applications yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-pink-400 bg-pink-400 text-xs uppercase text-white">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Position Interest</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {candidates.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/erp/candidates/${c.id}`} className="hover:text-[#E73C6E] hover:underline">
                      {c.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{c.positionInterest ?? "—"}</td>
                  <td className="px-4 py-3">
                    <CandidateStatusSelect id={c.id} initialStatus={c.status} />
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