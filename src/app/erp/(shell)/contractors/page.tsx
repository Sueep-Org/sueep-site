import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NewContractorForm } from "./NewContractorForm";
import { subCoverage, type CoverageItem } from "@/lib/erp/subCoverage";
import { getErpAuth } from "@/lib/erpAuth";
import { canSeeProposals } from "@/lib/erp/subBids";
import { loadAllSubScoresCached, loadBidderBidLines, loadContractorBidLines, summarizeBids } from "@/lib/erp/subBidStats";
import { loadPastBidders } from "@/lib/erp/subBidLinks";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { BiddersTab, type BidderRow } from "./BiddersTab";
import { ReviewsTab } from "./ReviewsTab";
import { isPmLevel } from "@/lib/erpRoles";
import { loadReviewList } from "@/lib/erp/subReviews";
import { FIELD_SCORE_HELP, OVERALL_SCORE_HELP, PRICING_SCORE_HELP, type SubScores } from "@/lib/erp/subScores";
import { Stars } from "@/app/erp/components/Stars";

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

type SortKey = "name" | "confidence" | "pricing" | "field" | "overall";
const SCORE_SORTS: SortKey[] = ["confidence", "pricing", "field", "overall"];

/** Header that sorts the list by a score: best first, click again for worst first. */
function SortTh({ label, sortKey, sort, dir, title }: { label: string; sortKey: SortKey; sort: SortKey; dir: "asc" | "desc"; title?: string }) {
  const active = sort === sortKey;
  const next = active ? (dir === "desc" ? "asc" : "desc") : sortKey === "name" ? "asc" : "desc";
  return (
    <th className="px-4 py-2 text-right first:text-left" title={title} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={`/erp/contractors?tab=Contractors&sort=${sortKey}&dir=${next}`} className={`inline-flex items-center gap-1 hover:text-gray-900 ${active ? "text-gray-900" : ""}`}>
        {label}
        <span aria-hidden className="text-[10px]">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </Link>
    </th>
  );
}

type PageProps = { searchParams: Promise<{ sort?: string; dir?: string }> };

export default async function ContractorsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const allContractors = await prisma.contractor.findMany({
    orderBy: { name: "asc" },
  });
  const auth = await getErpAuth();
  const showBids = canSeeProposals(auth?.role);
  // Every PM's open reviews; the review page itself still checks who can act on each
  const reviews = auth && isPmLevel(auth.role) ? await loadReviewList(auth, { status: ["PENDING", "NEEDS_FIX"], mine: false }) : null;
  const [bidLines, scores, pastBidders, bidderLines] = showBids
    ? await Promise.all([loadContractorBidLines(), loadAllSubScoresCached(), loadPastBidders(), loadBidderBidLines()])
    : [new Map(), new Map(), [], new Map()];
  // Scores sort best first; contractors with no score always go last
  const sort: SortKey = showBids && SCORE_SORTS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "name";
  const dir: "asc" | "desc" = sp.dir === "asc" || sp.dir === "desc" ? sp.dir : sort === "name" ? "asc" : "desc";
  const scoreOf = (id: string) => (sort === "name" ? null : ((scores as Map<string, SubScores>).get(id)?.[sort] ?? null));
  const contractors =
    sort === "name"
      ? dir === "desc"
        ? [...allContractors].reverse()
        : allContractors
      : [...allContractors].sort((a, b) => {
          const x = scoreOf(a.id);
          const y = scoreOf(b.id);
          if (x == null || y == null) return x == null && y == null ? a.name.localeCompare(b.name) : x == null ? 1 : -1;
          return (dir === "desc" ? y - x : x - y) || a.name.localeCompare(b.name);
        });
  const bidders: BidderRow[] = pastBidders.map((b) => {
    const lines = bidderLines.get(b.key) ?? [];
    return { ...b, lines, summary: summarizeBids(lines) };
  });

  const contractorList = (contractors.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          No contractors yet. Add one above.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[500px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                {showBids ? <SortTh label="Name" sortKey="name" sort={sort} dir={dir} /> : <th className="px-4 py-2">Name</th>}
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-center">GL</th>
                <th className="px-4 py-2 text-center">WC</th>
                {showBids ? (
                  <>
                    <th className="px-4 py-2 text-right">Bids</th>
                    <th className="px-4 py-2 text-right">Avg margin</th>
                    <SortTh label="Confidence" sortKey="confidence" sort={sort} dir={dir} title="Average of the quality, reliability and communication ratings, out of 5" />
                    <SortTh label="Pricing" sortKey="pricing" sort={sort} dir={dir} title={PRICING_SCORE_HELP} />
                    <SortTh label="Field" sortKey="field" sort={sort} dir={dir} title={FIELD_SCORE_HELP} />
                    <SortTh label="Overall" sortKey="overall" sort={sort} dir={dir} title={OVERALL_SCORE_HELP} />
                  </>
                ) : null}
                <th className="px-4 py-2">Added</th>
              </tr>
            </thead>
            <tbody>
              {contractors.map((c, i) => {
                const coverage = subCoverage(c);
                const gl = coverage.items.find((it) => it.key === "gl");
                const wc = coverage.items.find((it) => it.key === "wc");
                const bids = showBids ? summarizeBids(bidLines.get(c.id) ?? []) : null;
                const score = scores.get(c.id);
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
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.role || "-"}</td>
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
                  {bids ? (
                    <>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {bids.bids === 0 ? "-" : `${bids.bids}${bids.awarded ? ` · ${bids.awarded} won` : ""}`}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {bids.avgMarginPct == null ? "-" : `${Math.round(bids.avgMarginPct)}%`}
                      </td>
                      <td className="px-4 py-3 text-right"><Stars value={score?.confidence ?? null} size="xs" /></td>
                      <td className="px-4 py-3 text-right"><Stars value={score?.pricing ?? null} size="xs" /></td>
                      <td className="px-4 py-3 text-right"><Stars value={score?.field ?? null} size="xs" /></td>
                      <td className="px-4 py-3 text-right font-medium"><Stars value={score?.overall ?? null} size="xs" /></td>
                    </>
                  ) : null}
                  <td className="px-4 py-3 text-gray-500">
                    {c.createdAt.toLocaleDateString()}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ));

  return (
    <div className="space-y-6">
      <NewContractorForm title={<h1 className="text-2xl font-semibold text-gray-900">Contractor Verification</h1>} />
      
      {showBids || reviews ? (
        <DetailTabs
          tabs={[
            { label: "Contractors", content: contractorList },
            ...(showBids ? [{ label: "Bidders", content: <BiddersTab bidders={bidders} /> }] : []),
            ...(reviews ? [{ label: "Reviews", content: <ReviewsTab reviews={reviews} /> }] : []),
          ]}
        />
      ) : (
        contractorList
      )}
    </div>
  );
}
