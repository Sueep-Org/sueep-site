import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import {
  cachedDealInvoices,
  erpBillingTotals,
  hubspotBillingTotals,
  totalsDisagree,
} from "@/lib/hubspot/projectDocuments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PROJECTS = 200;
// Each project is several HubSpot calls; more parallel than this trips
// HubSpot's 10-second rate limit (hubspotFetch retries, but slowly).
const CONCURRENCY = 3;

/**
 * HubSpot invoices for the post-construction billing rows, loaded after the
 * table so a slow HubSpot never holds up the page. `ids` = comma-separated
 * project ids. Each project gets its invoices plus both sides' invoiced/paid
 * totals, so the page can flag projects where HubSpot and the ERP disagree.
 */
export async function GET(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_PROJECTS);
  if (ids.length === 0) return NextResponse.json({ projects: {} });

  const projects = await prisma.project.findMany({
    where: { id: { in: ids }, hubspotDealId: { not: null } },
    select: { id: true, hubspotDealId: true },
  });
  const projectIds = projects.map((p) => p.id);
  const [erpTotals, linkRows, sovCounts, coCounts] = await Promise.all([
    erpBillingTotals(projectIds),
    prisma.hubSpotSovInvoice.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, hubspotInvoiceId: true } }),
    prisma.projectSOV.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true, _count: { select: { items: true } } } }),
    prisma.projectChangeOrder.groupBy({ by: ["projectId"], where: { projectId: { in: projectIds } }, _count: true }),
  ]);
  const linkedIds = new Set(linkRows.map((r) => `${r.projectId}:${r.hubspotInvoiceId}`));
  // Only projects with SOV items or change orders have anything to link to.
  const linkable = new Set([
    ...sovCounts.filter((s) => s._count.items > 0).map((s) => s.projectId),
    ...coCounts.map((c) => c.projectId),
  ]);

  const result: Record<string, unknown> = {};
  const queue = [...projects];
  async function worker() {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        const invoices = await cachedDealInvoices(p.hubspotDealId!);
        const hubspot = hubspotBillingTotals(invoices);
        const erp = erpTotals.get(p.id) ?? { invoicedCents: 0, paidCents: 0 };
        result[p.id] = {
          invoices: invoices.map((i) => ({
            id: i.id,
            invoiceNumber: i.number,
            status: i.status,
            dueDate: i.dueDate,
            paidDate: i.paidDate,
            amountCents: i.billedCents ?? 0,
            viewUrl: i.viewUrl,
          })),
          hubspot,
          erp,
          mismatch: invoices.length > 0 && totalsDisagree(hubspot, erp),
          unlinkedCount: linkable.has(p.id)
            ? invoices.filter((i) => i.status !== "voided" && !linkedIds.has(`${p.id}:${i.id}`)).length
            : 0,
        };
      } catch (err) {
        result[p.id] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return NextResponse.json({ projects: result });
}
