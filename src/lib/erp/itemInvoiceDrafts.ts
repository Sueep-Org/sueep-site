/**
 * Ready to bill: finished work that isn't billed and has no invoice yet
 * (unit turns, SOV lines, change orders since BILLING_DATA_START), and the
 * HubSpot drafts made from items someone picks. Nothing is drafted on its
 * own; companies without a billing day bill whenever the work is done.
 *
 * Picked items become one draft per building (turnovers and their change
 * orders, on the building's deal) or per job (post-construction, on the
 * project's deal), one line per item. Each item is linked to the draft with
 * a manual link (HubSpotUnitInvoice / HubSpotSovInvoice), so the syncs leave
 * it alone and the paid sync marks it Paid later. Approve opens the invoice
 * in HubSpot (QuickBooks) and marks the items Billed, same follow-ups as the
 * Billing page.
 */
import { prisma } from "@/lib/prisma";
import { normalizeBillingStatus } from "./billingStatus";
import { BILLING_DATA_START } from "./dashboardMoney";
import { todayEasternKey, utcDateKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { loadBuildingInvoiceDestination, loadProjectInvoiceDestination } from "./invoiceDestination";
import { isApproveEnabled } from "./janitorialInvoiceDrafts";
import { syncProjectBillingFromRequest, syncProjectBillingFromSOV, syncSovPercentDone } from "@/lib/sovSync";
import {
  associateDefault,
  createDraftInvoice,
  deleteDraftInvoice,
  fetchInvoiceSnapshot,
  findBillingParties,
  openInvoice,
  replaceInvoiceLines,
  type InvoiceSnapshot,
} from "@/lib/hubspot/invoiceDrafts";

export type ItemKind = "TURN" | "SOV" | "CO";

export type BillableItem = {
  /** "TURN:<turnoverRequestId>", "SOV:<sovItemId>" or "CO:<changeOrderId>" */
  key: string;
  kind: ItemKind;
  title: string;
  /** Invoice line name and description */
  lineName: string;
  lineDescription: string;
  cents: number;
  doneKey: string;
  projectId: string;
  href: string;
};

export type BillableGroup = {
  /** "BUILDING:<id>" or "PROJECT:<id>" */
  key: string;
  type: "BUILDING" | "PROJECT";
  id: string;
  name: string;
  dealId: string | null;
  items: BillableItem[];
};

const since = () => new Date(`${BILLING_DATA_START}T00:00:00Z`);

/** "14" reads "Unit 14"; "Unit 228", "BLDG 1 - Unit 335" or "Exterior Window Cleaning" stay as typed. */
function unitLabel(unitNumber: string): string {
  return /^[a-z]?\d+[a-z]?$/i.test(unitNumber.trim()) ? `Unit ${unitNumber.trim()}` : unitNumber.trim();
}
const NOT_VOIDED = { status: { not: "voided" } };

/** Where an item's invoice belongs: its job's own deal, else its building's. */
function groupFor(p: {
  id: string;
  jobTitle: string;
  hubspotDealId: string | null;
  building: { id: string; name: string; hubspotDealId: string | null } | null;
  turnoverRequest: { building: { id: string; name: string; hubspotDealId: string | null } | null } | null;
}): Omit<BillableGroup, "items"> {
  if (p.hubspotDealId) return { key: `PROJECT:${p.id}`, type: "PROJECT", id: p.id, name: p.jobTitle, dealId: p.hubspotDealId };
  const b = p.turnoverRequest?.building ?? p.building;
  if (b) return { key: `BUILDING:${b.id}`, type: "BUILDING", id: b.id, name: b.name, dealId: b.hubspotDealId };
  return { key: `PROJECT:${p.id}`, type: "PROJECT", id: p.id, name: p.jobTitle, dealId: null };
}

const projectSelect = {
  id: true,
  jobTitle: true,
  hubspotDealId: true,
  building: { select: { id: true, name: true, hubspotDealId: true } },
  turnoverRequest: { select: { building: { select: { id: true, name: true, hubspotDealId: true } } } },
} as const;

/** Every finished, unbilled item with no invoice linked yet, grouped for invoicing. */
export async function loadBillableGroups(only?: Set<string>): Promise<BillableGroup[]> {
  const s = since();
  const [turns, sovItems, changeOrders] = await Promise.all([
    prisma.project.findMany({
      where: {
        status: "COMPLETE",
        turnoverRequestId: { not: null },
        OR: [{ turnoverCompletedAt: { gte: s } }, { turnoverCompletedAt: null, projectEndDate: { gte: s } }],
        turnoverRequest: { unitNumber: { not: null }, hubspotUnitInvoices: { none: NOT_VOIDED } },
      },
      select: {
        ...projectSelect,
        billingStatus: true,
        contractValueCents: true,
        turnoverCompletedAt: true,
        projectEndDate: true,
        turnoverRequest: { select: { id: true, unitNumber: true, billingStatus: true, approvedPriceCents: true, priceCents: true, building: { select: { id: true, name: true, hubspotDealId: true } } } },
      },
    }),
    prisma.projectSOVItem.findMany({
      where: {
        completed: true,
        billingStatus: "NOT_BILLED",
        OR: [{ completedAt: { gte: s } }, { completedAt: null, updatedAt: { gte: s } }],
        hubspotSovInvoices: { none: NOT_VOIDED },
      },
      select: { id: true, description: true, scheduledValueCents: true, completedAt: true, updatedAt: true, sov: { select: { project: { select: projectSelect } } } },
    }),
    prisma.projectChangeOrder.findMany({
      where: {
        status: { in: ["COMPLETED", "BILLING"] },
        OR: [{ completedAt: { gte: s } }, { completedAt: null, updatedAt: { gte: s } }],
        hubspotSovInvoices: { none: NOT_VOIDED },
      },
      select: { id: true, title: true, billingStatus: true, contractValueCents: true, completedAt: true, updatedAt: true, project: { select: projectSelect } },
    }),
  ]);

  const groups = new Map<string, BillableGroup>();
  const add = (g: Omit<BillableGroup, "items">, item: BillableItem) => {
    if (only && !only.has(item.key)) return;
    const existing = groups.get(g.key) ?? { ...g, items: [] };
    existing.items.push(item);
    groups.set(g.key, existing);
  };

  for (const t of turns) {
    const tr = t.turnoverRequest!;
    if (normalizeBillingStatus(tr.billingStatus ?? t.billingStatus) !== "NOT_BILLED") continue;
    const g = groupFor(t);
    add(g, {
      key: `TURN:${tr.id}`,
      kind: "TURN",
      title: t.jobTitle,
      lineName: "Turn Over",
      lineDescription: `${g.name} - ${unitLabel(tr.unitNumber!)}`,
      // Same amount the Billing page shows for a turn.
      cents: tr.approvedPriceCents ?? tr.priceCents ?? t.contractValueCents ?? 0,
      doneKey: t.turnoverCompletedAt ? todayEasternKey(t.turnoverCompletedAt) : utcDateKey(t.projectEndDate!),
      projectId: t.id,
      href: `/erp/projects/${t.id}`,
    });
  }
  for (const i of sovItems) {
    const p = i.sov.project;
    add(groupFor(p), {
      key: `SOV:${i.id}`,
      kind: "SOV",
      title: i.description,
      lineName: i.description,
      lineDescription: p.jobTitle,
      cents: i.scheduledValueCents,
      doneKey: utcDateKey(i.completedAt ?? i.updatedAt),
      projectId: p.id,
      href: `/erp/projects/${p.id}`,
    });
  }
  for (const co of changeOrders) {
    if (normalizeBillingStatus(co.billingStatus) !== "NOT_BILLED") continue;
    add(groupFor(co.project), {
      key: `CO:${co.id}`,
      kind: "CO",
      title: `Change order: ${co.title}`,
      lineName: co.title,
      lineDescription: `${co.project.jobTitle} - Change order`,
      cents: co.contractValueCents ?? 0,
      doneKey: utcDateKey(co.completedAt ?? co.updatedAt),
      projectId: co.project.id,
      href: `/erp/projects/${co.project.id}/change-orders/${co.id}`,
    });
  }

  return [...groups.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.doneKey.localeCompare(b.doneKey)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function snapshotColumns(s: InvoiceSnapshot) {
  const d = (v: string | null) => (v ? new Date(v) : null);
  return {
    invoiceNumber: s.number,
    status: s.status,
    invoiceDate: d(s.invoiceDate),
    dueDate: d(s.dueDate),
    invoiceTotalCents: s.totalCents,
    balanceDueCents: s.balanceDueCents,
    viewUrl: s.viewUrl,
    pdfUrl: s.pdfUrl,
  };
}

export type DraftItemsResult = { group: string; ok: boolean; note?: string };

/**
 * Drafts the picked items: one HubSpot draft per group. `amounts` can
 * change an item's amount for this invoice (e.g. to add an "Other" add-on).
 */
export async function draftItems(picks: { key: string; amountCents: number }[], email: string): Promise<DraftItemsResult[]> {
  const amountByKey = new Map(picks.map((p) => [p.key, p.amountCents]));
  const groups = await loadBillableGroups(new Set(amountByKey.keys()));
  const results: DraftItemsResult[] = [];
  const todayKey = todayEasternKey();

  for (const g of groups) {
    if (!g.dealId) {
      results.push({ group: g.name, ok: false, note: g.type === "BUILDING" ? "No HubSpot deal is linked to this building." : "No HubSpot deal is linked to this job." });
      continue;
    }
    const lines = g.items.map((i) => ({ name: i.lineName, description: i.lineDescription, amountCents: amountByKey.get(i.key) ?? i.cents }));
    let invoiceId: string | null = null;
    try {
      const dest = g.type === "BUILDING" ? await loadBuildingInvoiceDestination(g.id) : await loadProjectInvoiceDestination(g.id);
      const dueDateKey = addDaysKey(todayKey, dest?.paymentTermsDays ?? 0);
      const parties = await findBillingParties(g.dealId);

      invoiceId = await createDraftInvoice({ invoiceDateKey: todayKey, dueDateKey });
      await associateDefault("invoices", invoiceId, "deals", g.dealId);
      if (parties.contactId) await associateDefault("invoices", invoiceId, "contacts", parties.contactId);
      if (parties.companyId) await associateDefault("invoices", invoiceId, "companies", parties.companyId);
      await replaceInvoiceLines(invoiceId, lines);
      const snap = snapshotColumns(await fetchInvoiceSnapshot(invoiceId));
      const link = { hubspotInvoiceId: invoiceId, manual: true, linkedByName: "ERP draft", ...snap };

      const writes = [];
      for (const [idx, item] of g.items.entries()) {
        const amountCents = lines[idx]!.amountCents;
        const [kind, id] = item.key.split(":") as [ItemKind, string];
        if (kind === "TURN") {
          const tr = await prisma.turnoverRequest.findUniqueOrThrow({ where: { id }, select: { buildingId: true, unitNumber: true } });
          writes.push(prisma.hubSpotUnitInvoice.create({ data: { ...link, buildingId: tr.buildingId!, unitNumber: tr.unitNumber!, turnoverRequestId: id, amountCents } }));
        } else {
          writes.push(prisma.hubSpotSovInvoice.create({ data: { ...link, projectId: item.projectId, ...(kind === "SOV" ? { sovItemId: id } : { changeOrderId: id }), amountCents } }));
        }
      }
      writes.push(
        prisma.itemInvoiceDraft.create({
          data: {
            hubspotInvoiceId: invoiceId,
            dealId: g.dealId,
            groupType: g.type,
            groupId: g.id,
            title: g.name,
            totalCents: lines.reduce((s, l) => s + l.amountCents, 0),
            createdByEmail: email,
            note: parties.contactId ? null : "No billing contact found on the deal. Add one to the draft in HubSpot before approving.",
          },
        }),
      );
      await prisma.$transaction(writes);
      results.push({ group: g.name, ok: true });
    } catch (e) {
      if (invoiceId) await deleteDraftInvoice(invoiceId).catch(() => undefined);
      results.push({ group: g.name, ok: false, note: e instanceof Error ? e.message : String(e) });
    }
  }
  const found = new Set(groups.flatMap((g) => g.items.map((i) => i.key)));
  const gone = picks.filter((p) => !found.has(p.key)).length;
  if (gone) results.push({ group: `${gone} item${gone === 1 ? "" : "s"}`, ok: false, note: "Already billed or on another invoice." });
  return results;
}

/** Every item linked to this invoice, across the link tables. */
async function linkedItems(hubspotInvoiceId: string) {
  const [units, sov] = await Promise.all([
    prisma.hubSpotUnitInvoice.findMany({ where: { hubspotInvoiceId }, select: { id: true, turnoverRequestId: true } }),
    prisma.hubSpotSovInvoice.findMany({ where: { hubspotInvoiceId }, select: { id: true, projectId: true, sovItemId: true, changeOrderId: true } }),
  ]);
  return { units, sov };
}

export async function approveItemDraft(draftId: string, email: string): Promise<{ ok: true; number: string | null } | { error: string }> {
  if (!(await isApproveEnabled())) return { error: "Approve is turned off. An Admin turns it on for the first invoice with the bookkeeper." };
  const draft = await prisma.itemInvoiceDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.status !== "DRAFT") return { error: "This draft isn't waiting anymore." };
  let snap: InvoiceSnapshot;
  try {
    await openInvoice(draft.hubspotInvoiceId);
    snap = await fetchInvoiceSnapshot(draft.hubspotInvoiceId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  const cols = snapshotColumns(snap);
  const { units, sov } = await linkedItems(draft.hubspotInvoiceId);
  await prisma.$transaction([
    prisma.hubSpotUnitInvoice.updateMany({ where: { hubspotInvoiceId: draft.hubspotInvoiceId }, data: cols }),
    prisma.hubSpotSovInvoice.updateMany({ where: { hubspotInvoiceId: draft.hubspotInvoiceId }, data: cols }),
    prisma.itemInvoiceDraft.update({ where: { id: draftId }, data: { status: "APPROVED", approvedAt: new Date(), approvedByEmail: email, invoiceNumber: snap.number } }),
  ]);

  // Mark each item Billed, with the same follow-ups as the Billing page. Never moves a Paid item back.
  for (const u of units) {
    if (!u.turnoverRequestId) continue;
    const { count } = await prisma.turnoverRequest.updateMany({ where: { id: u.turnoverRequestId, billingStatus: { notIn: ["BILLED", "PAID"] } }, data: { billingStatus: "BILLED" } });
    if (count) await syncProjectBillingFromRequest(u.turnoverRequestId, "BILLED");
  }
  const sovProjects = new Set<string>();
  for (const l of sov) {
    if (l.sovItemId) {
      const { count } = await prisma.projectSOVItem.updateMany({ where: { id: l.sovItemId, billingStatus: "NOT_BILLED" }, data: { billingStatus: "BILLED" } });
      if (count) sovProjects.add(l.projectId);
    }
    if (l.changeOrderId) {
      const co = await prisma.projectChangeOrder.findUnique({ where: { id: l.changeOrderId }, select: { billingStatus: true } });
      if (co && normalizeBillingStatus(co.billingStatus) === "NOT_BILLED") {
        await prisma.projectChangeOrder.update({ where: { id: l.changeOrderId }, data: { billingStatus: "BILLED" } });
      }
    }
  }
  for (const projectId of sovProjects) {
    await syncSovPercentDone(projectId);
    await syncProjectBillingFromSOV(projectId);
  }
  return { ok: true, number: snap.number };
}

/** Deletes the draft in HubSpot; its items go back on Ready to bill. */
export async function discardItemDraft(draftId: string, email: string): Promise<{ ok: true } | { error: string }> {
  const draft = await prisma.itemInvoiceDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.status !== "DRAFT") return { error: "This draft isn't waiting anymore." };
  try {
    await deleteDraftInvoice(draft.hubspotInvoiceId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  await prisma.$transaction([
    prisma.hubSpotUnitInvoice.deleteMany({ where: { hubspotInvoiceId: draft.hubspotInvoiceId } }),
    prisma.hubSpotSovInvoice.deleteMany({ where: { hubspotInvoiceId: draft.hubspotInvoiceId } }),
    prisma.itemInvoiceDraft.update({ where: { id: draftId }, data: { status: "DISCARDED", discardedAt: new Date(), discardedByEmail: email } }),
  ]);
  return { ok: true };
}

/** Lines of a waiting draft, rebuilt from its links, for the list. */
export async function loadWaitingItemDrafts() {
  const drafts = await prisma.itemInvoiceDraft.findMany({ where: { status: "DRAFT" }, orderBy: { createdAt: "asc" } });
  const ids = drafts.map((d) => d.hubspotInvoiceId);
  const [units, sov] = await Promise.all([
    prisma.hubSpotUnitInvoice.findMany({ where: { hubspotInvoiceId: { in: ids } }, select: { hubspotInvoiceId: true, unitNumber: true, amountCents: true, dueDate: true } }),
    prisma.hubSpotSovInvoice.findMany({
      where: { hubspotInvoiceId: { in: ids } },
      select: { hubspotInvoiceId: true, amountCents: true, dueDate: true, sovItem: { select: { description: true } }, changeOrder: { select: { title: true } } },
    }),
  ]);
  return drafts.map((d) => {
    const lines = [
      ...units.filter((u) => u.hubspotInvoiceId === d.hubspotInvoiceId).map((u) => ({ name: "Turn Over", description: unitLabel(u.unitNumber), amountCents: u.amountCents, due: u.dueDate })),
      ...sov
        .filter((s) => s.hubspotInvoiceId === d.hubspotInvoiceId)
        .map((s) => ({ name: s.sovItem?.description ?? s.changeOrder?.title ?? "Line", description: s.changeOrder ? "Change order" : "SOV line", amountCents: s.amountCents, due: s.dueDate })),
    ];
    return { draft: d, lines, dueDate: lines.find((l) => l.due)?.due ?? null };
  });
}
