/**
 * HubSpot invoices the line-item sync couldn't place on any ERP line
 * (HubSpotInvoiceLineItemMatch still PENDING_REVIEW, and no link row), with
 * their number, status and date read from HubSpot. The sync's first pass
 * (Aug 2026) also saw years of old paid invoices, so callers pass `since` to
 * keep only invoices dated from then on.
 */
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { batchRead } from "@/lib/hubspot/dealDocuments";

export type UnlinkedHubSpotInvoice = {
  hubspotInvoiceId: string;
  number: string | null;
  status: string | null;
  /** YYYY-MM-DD, null when HubSpot couldn't be read */
  invoiceDateKey: string | null;
  amountCents: number;
  lines: number;
  /** Where the sync thinks it belongs (the deal's project or building) */
  projectId: string | null;
  buildingId: string | null;
  title: string;
  href: string;
};

type Header = { id: string; number: string | null; status: string | null; date: string | null };

async function fetchHeaders(ids: string[]): Promise<Header[]> {
  const records = await batchRead("invoices", ids, ["hs_number", "hs_invoice_status", "hs_invoice_date"]);
  return records.map((r) => ({
    id: r.id,
    number: r.properties.hs_number ?? null,
    status: r.properties.hs_invoice_status ?? null,
    date: r.properties.hs_invoice_date?.slice(0, 10) ?? null,
  }));
}

// Invoice headers change rarely; one HubSpot read an hour is plenty.
const cachedHeaders = unstable_cache(fetchHeaders, ["unlinked-hubspot-invoice-headers-v1"], { revalidate: 3600 });

/** Cached inside the app; scripts have no Next cache, so they read HubSpot directly. */
async function readHeaders(ids: string[]): Promise<Header[]> {
  try {
    return await cachedHeaders(ids);
  } catch (e) {
    if (e instanceof Error && /incrementalCache/i.test(e.message)) return fetchHeaders(ids);
    throw e;
  }
}

export const loadUnlinkedHubSpotInvoices = cache(async (since: string): Promise<UnlinkedHubSpotInvoice[]> => {
  const [pending, unitLinks, sovLinks, contractLinks] = await Promise.all([
    prisma.hubSpotInvoiceLineItemMatch.findMany({
      where: { status: "PENDING_REVIEW" },
      select: {
        hubspotInvoiceId: true,
        amountCents: true,
        createdAt: true,
        project: { select: { id: true, jobTitle: true } },
        building: { select: { id: true, name: true } },
      },
    }),
    prisma.hubSpotUnitInvoice.findMany({ where: { status: { not: "voided" } }, select: { hubspotInvoiceId: true } }),
    prisma.hubSpotSovInvoice.findMany({ where: { status: { not: "voided" } }, select: { hubspotInvoiceId: true } }),
    prisma.hubSpotContractInvoice.findMany({ where: { status: { not: "voided" } }, select: { hubspotInvoiceId: true } }),
  ]);
  const linked = new Set([...unitLinks, ...sovLinks, ...contractLinks].map((l) => l.hubspotInvoiceId));

  const byId = new Map<string, UnlinkedHubSpotInvoice & { firstSeen: string }>();
  for (const m of pending) {
    if (linked.has(m.hubspotInvoiceId)) continue;
    const row = byId.get(m.hubspotInvoiceId);
    if (row) {
      row.amountCents += m.amountCents;
      row.lines += 1;
      continue;
    }
    byId.set(m.hubspotInvoiceId, {
      hubspotInvoiceId: m.hubspotInvoiceId,
      number: null,
      status: null,
      invoiceDateKey: null,
      amountCents: m.amountCents,
      lines: 1,
      projectId: m.project?.id ?? null,
      buildingId: m.building?.id ?? null,
      title: m.project?.jobTitle ?? m.building?.name ?? "No building or project matched",
      href: m.project ? `/erp/projects/${m.project.id}` : m.building ? `/erp/buildings/${m.building.id}` : "/erp/billing",
      firstSeen: m.createdAt.toISOString().slice(0, 10),
    });
  }
  if (byId.size === 0) return [];

  let headers: Header[] | null = null;
  try {
    headers = await readHeaders([...byId.keys()].sort());
  } catch (e) {
    console.error("[unlinkedHubSpotInvoices] HubSpot read failed", e);
  }
  const byHeader = new Map((headers ?? []).map((h) => [h.id, h]));

  return [...byId.values()]
    .map(({ firstSeen, ...r }) => {
      const h = byHeader.get(r.hubspotInvoiceId);
      // Without HubSpot, fall back to when the sync first saw it.
      return { ...r, number: h?.number ?? null, status: h?.status ?? null, invoiceDateKey: h ? h.date : firstSeen };
    })
    .filter((r) => r.status !== "voided" && r.status !== "draft" && (r.invoiceDateKey ?? "") >= since)
    .sort((a, b) => (a.invoiceDateKey ?? "").localeCompare(b.invoiceDateKey ?? ""));
});
