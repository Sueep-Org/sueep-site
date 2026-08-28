import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CandidateStatusSelect } from "./CandidateStatusSelect";
import { CandidatesFilterBar } from "./CandidatesFilterBar";
import { NewCandidateForm } from "./NewCandidateForm";
import { SUBCONTRACTOR_GATE_FIELD } from "@/lib/erp/subcontractorQuestionnaire";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CandidatesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const search = typeof sp.search === "string" ? sp.search.trim() : "";
  const statusFilter = typeof sp.status === "string" ? sp.status.trim() : "";
  const positionFilter = typeof sp.position === "string" ? sp.position.trim() : "";
  const typeFilter = typeof sp.type === "string" ? sp.type.trim() : "";
  const requestedPage = typeof sp.page === "string" ? parseInt(sp.page, 10) : 1;

  const where = {
    ...(search ? { fullName: { contains: search, mode: "insensitive" as const } } : {}),
    // When no status filter is active, hide hired candidates (they are now employees)
    ...(statusFilter ? { status: statusFilter } : { status: { not: "HIRED" } }),
    // Exact match would miss combined "Cleaner, Painter" applicants when
    // filtering by just one position, since the field can now hold both.
    ...(positionFilter ? { positionInterest: { contains: positionFilter } } : {}),
  };

  // Lightweight pass over just id/status/createdAt/responses to work out
  // ordering, the subcontractor/individual filter, and pagination. Denied
  // applicants are sorted to the end when viewing the combined/unfiltered
  // list. Full rows (paperwork, everything else) are only fetched for the
  // current page below, not the whole table, every load.
  //
  // The subcontractor/individual split is filtered here in JS rather than
  // pushed into the Prisma `where`. A SQL `NOT` over a JSON path filter
  // silently excludes rows that have no `responses` at all (three-valued
  // NULL logic: the underlying comparison is unknown, not false, for a
  // missing path, so NOT of it is also unknown, matching neither side).
  // That would've made "Individual" quietly hide every candidate who never
  // touched the subcontractor question, arguably most of them.
  let sortRows = await prisma.candidateApplication.findMany({
    where,
    select: { id: true, status: true, createdAt: true, responses: true },
  });

  if (typeFilter === "subcontractor" || typeFilter === "individual") {
    sortRows = sortRows.filter((r) => {
      const isSubcontractor = (r.responses as Record<string, unknown> | null)?.[SUBCONTRACTOR_GATE_FIELD] === "Yes";
      return typeFilter === "subcontractor" ? isSubcontractor : !isSubcontractor;
    });
  }

  sortRows.sort((a, b) => {
    if (!statusFilter) {
      const aDenied = a.status === "DENIED" ? 1 : 0;
      const bDenied = b.status === "DENIED" ? 1 : 0;
      if (aDenied !== bDenied) return aDenied - bDenied;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const totalCount = sortRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1), totalPages);
  const pageIds = sortRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => r.id);

  const pageRows = pageIds.length
    ? await prisma.candidateApplication.findMany({ where: { id: { in: pageIds } } })
    : [];
  const rowById = new Map(pageRows.map((r) => [r.id, r]));
  const candidates = pageIds.map((id) => rowById.get(id)).filter((r): r is (typeof pageRows)[number] => !!r);

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (positionFilter) params.set("position", positionFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/erp/candidates?${qs}` : "/erp/candidates";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-pink-600">Candidates</h1>

        <div className="mt-3 flex items-center justify-between gap-4">
          <form>
            <input
              name="search"
              defaultValue={search}
              placeholder="Search by name…"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            />
            {/* Preserve every active filter when this form submits on its own
                (e.g. pressing Enter), same reasoning as the hidden fields
                inside CandidatesFilterBar's popover form. */}
            <input type="hidden" name="status" value={statusFilter} />
            <input type="hidden" name="position" value={positionFilter} />
            <input type="hidden" name="type" value={typeFilter} />
          </form>
          <div className="flex items-center gap-2">
            <CandidatesFilterBar search={search} status={statusFilter} position={positionFilter} type={typeFilter} />
            <NewCandidateForm />
          </div>
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          No applications yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Phone</th>
                <th className="px-4 py-2 font-semibold">Position Interest</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Applied</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => (
                <tr key={c.id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100 transition-colors`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/erp/candidates/${c.id}`} className="text-gray-800 hover:underline">
                      {c.fullName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-700">{c.positionInterest ?? "—"}</td>
                  <td className="px-4 py-3">
                    {(c.responses as Record<string, unknown> | null)?.[SUBCONTRACTOR_GATE_FIELD] === "Yes" ? (
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Subcontractor
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Individual</span>
                    )}
                  </td>
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