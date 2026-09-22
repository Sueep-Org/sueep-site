import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFranchiseInquiries } from "@/lib/erpAuth";
import { FranchiseStatusSelect } from "./FranchiseStatusSelect";
import { FranchiseFilterBar } from "./FranchiseFilterBar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function FranchisePage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFranchiseInquiries(auth.role)) redirect("/erp");

  const sp = await searchParams;
  const search = typeof sp.search === "string" ? sp.search.trim() : "";
  const statusFilter = typeof sp.status === "string" ? sp.status.trim() : "";
  const marketFilter = typeof sp.market === "string" ? sp.market.trim() : "";
  const requestedPage = typeof sp.page === "string" ? parseInt(sp.page, 10) : 1;

  const where = {
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" as const } },
            { lastName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(marketFilter ? { market: marketFilter } : {}),
  };

  const totalCount = await prisma.franchiseInquiry.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1), totalPages);

  const inquiries = await prisma.franchiseInquiry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (marketFilter) params.set("market", marketFilter);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/erp/franchise?${qs}` : "/erp/franchise";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-pink-600">Franchise Inquiries</h1>

        <div className="mt-3 flex items-center justify-between gap-4">
          <form>
            <input
              name="search"
              defaultValue={search}
              placeholder="Search by name…"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            />
            <input type="hidden" name="status" value={statusFilter} />
            <input type="hidden" name="market" value={marketFilter} />
          </form>
          <FranchiseFilterBar search={search} status={statusFilter} market={marketFilter} />
        </div>
      </div>

      {inquiries.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          No franchise inquiries yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Phone</th>
                <th className="px-4 py-2 font-semibold">Market</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {inquiries.map((c, i) => (
                <tr key={c.id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100 transition-colors`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/erp/franchise/${c.id}`} className="text-gray-800 hover:underline">
                      {c.firstName} {c.lastName}
                    </Link>
                    {c.responses == null && (
                      <span className="ml-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        Incomplete
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.phone}</td>
                  <td className="px-4 py-3 text-gray-700">{c.market ?? "-"}</td>
                  <td className="px-4 py-3">
                    <FranchiseStatusSelect id={c.id} initialStatus={c.status} />
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

      {totalCount > 0 ? (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {page} of {totalPages} ({totalCount} total)
          </span>
          <div className="flex gap-2">
            <Link
              href={pageHref(page - 1)}
              aria-disabled={page <= 1}
              className={`rounded-md border border-gray-300 px-3 py-1.5 ${
                page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-gray-100"
              }`}
            >
              Previous
            </Link>
            <Link
              href={pageHref(page + 1)}
              aria-disabled={page >= totalPages}
              className={`rounded-md border border-gray-300 px-3 py-1.5 ${
                page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-gray-100"
              }`}
            >
              Next
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
