import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { centsToDollars } from "@/lib/erp/money";

export const dynamic = "force-dynamic";

export default async function ErpProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: [{ projectDate: "desc" }, { updatedAt: "desc" }],
    take: 300,
    include: { _count: { select: { laborEntries: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Projects</h1>
          <p className="mt-1 text-sm text-zinc-600">Commercial & residential job tracking</p>
        </div>
        <Link
          href="/erp/projects/new"
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
        >
          New project
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Segment</th>
              <th className="px-3 py-2 font-medium">Supervisor</th>
              <th className="px-3 py-2 font-medium">%</th>
              <th className="px-3 py-2 font-medium">Contract</th>
              <th className="px-3 py-2 font-medium">Labor logs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {projects.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                  No projects yet.{" "}
                  <Link href="/erp/projects/new" className="text-pink-600 hover:underline">
                    Create one
                  </Link>{" "}
                  or import from HubSpot under{" "}
                  <Link href="/erp/hubspot" className="text-pink-600 hover:underline">
                    HubSpot sync
                  </Link>
                  .
                </td>
              </tr>
            ) : (
              projects.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/erp/projects/${p.id}`} className="font-medium text-pink-600 hover:underline">
                      {p.jobTitle}
                    </Link>
                    {p.description ? <p className="text-xs text-zinc-500 line-clamp-1">{p.description}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">{p.segment}</td>
                  <td className="px-3 py-2 text-zinc-600">{p.supervisor || "—"}</td>
                  <td className="px-3 py-2 text-zinc-700">{p.percentDone}%</td>
                  <td className="px-3 py-2 text-zinc-700">{centsToDollars(p.contractValueCents)}</td>
                  <td className="px-3 py-2 text-zinc-600">{p._count.laborEntries}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
