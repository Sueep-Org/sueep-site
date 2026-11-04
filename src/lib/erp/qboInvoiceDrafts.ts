/**
 * Ready to send drafts that live in the ERP and become QuickBooks invoices
 * on Approve (ERP_QBO_INVOICING_PLAN.md Phase 3).
 *
 * A per-server switch decides where new drafts go: HubSpot (as before) or
 * QuickBooks. Local dev talks to the QuickBooks sandbox and the live site to
 * the real company, but both share one database, so drafts, the switch and
 * the invoice number counter are all kept per environment.
 *
 * Approve, for both janitorial months and picked finished work:
 * - customer: the client company's QuickBooks customer (confirmed on Invoice
 *   setup), with a sub-customer per building or job under it, made the
 *   first time it's needed;
 * - products: the line kinds' products from Invoice setup;
 * - number: the next INV-xxxx, picked by the ERP;
 * - the project contact goes on the invoice as "Attention", the Send to
 *   addresses as its bill-to email.
 * In the sandbox that's all: the draft becomes TESTED and no real turn,
 * line or month changes. In production the items are linked to the new
 * invoice (source QUICKBOOKS) and marked Billed, like a HubSpot Approve.
 * Production stays off until the cutover (Phase 5).
 *
 * Then it goes to the client (invoiceDelivery.ts, Phase 4): emailed with
 * QuickBooks' PDF, or onto Needs upload / Needs sending. A sandbox Approve
 * only emails the approver a test copy.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayEasternKey, utcDateKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { loadBuildingInvoiceDestination, loadProjectInvoiceDestination, type InvoiceDestination } from "./invoiceDestination";
import { billingDateKey, draftLines, monthLabel } from "./janitorialInvoiceDrafts";
import { markItemsBilled } from "./itemInvoiceDrafts";
import { loadQboConnection, qboEnvironment, qboGet, qboPost, type QboEnvironment } from "./qboClient";
import { LINE_KINDS, QBO_ITEM_MAP_KEY, sameName, subCustomerName, type LineKind } from "./qboMapping";
import { QUICKBOOKS_LINKS } from "./invoiceLinkSource";
import { deliverApprovedInvoice, emailSandboxTest, type InvoiceForDelivery } from "./invoiceDelivery";

export type QboDraftLine = {
  /** "TURN:<id>", "SOV:<id>", "CO:<id>"; null on janitorial lines */
  itemKey: string | null;
  projectId: string | null;
  lineKind: LineKind;
  name: string;
  description: string;
  amountCents: number;
};

const switchKey = (env: QboEnvironment) => `qboInvoiceDrafts.${env}`;
const counterKey = (env: QboEnvironment) => `qboNextInvoiceNumber.${env}`;

/** True when this server drafts new Ready to send invoices for QuickBooks instead of HubSpot. */
export async function draftsGoToQuickBooks(): Promise<boolean> {
  return (await prisma.appSetting.findUnique({ where: { key: switchKey(qboEnvironment()) } }))?.value === "true";
}

/**
 * Admin switch: new drafts go to QuickBooks (normal) or HubSpot (backup).
 * Switching to QuickBooks can set the next invoice number, so the ERP carries
 * on after the last one made anywhere else.
 */
export async function setDraftsGoToQuickBooks(on: boolean, nextNumber?: number): Promise<{ ok: true } | { error: string }> {
  const env = qboEnvironment();
  if (on && env === "production") {
    const conn = await loadQboConnection();
    if (!conn || conn.status !== "CONNECTED") return { error: "Connect QuickBooks on the QuickBooks page first." };
  }
  if (on && nextNumber !== undefined) {
    if (!Number.isInteger(nextNumber) || nextNumber < 1 || nextNumber > 9_999_999) return { error: "Enter the next invoice number, like 1411." };
    const taken = await highestInvoiceNumber();
    if (nextNumber <= taken) return { error: `INV-${taken} is already used. Pick ${taken + 1} or higher.` };
    await prisma.appSetting.upsert({ where: { key: counterKey(env) }, create: { key: counterKey(env), value: String(nextNumber) }, update: { value: String(nextNumber) } });
  }
  const value = on ? "true" : "false";
  await prisma.appSetting.upsert({ where: { key: switchKey(env) }, create: { key: switchKey(env), value }, update: { value } });
  return { ok: true };
}

/** The number the next QuickBooks invoice from this server would get, for the switch's confirm box. */
export async function suggestedNextInvoiceNumber(): Promise<number> {
  const env = qboEnvironment();
  const saved = await prisma.appSetting.findUnique({ where: { key: counterKey(env) } });
  const highest = await highestInvoiceNumber();
  return Math.max(Number(saved?.value) || 0, highest + 1);
}

/** A janitorial month's lines, with the kind of each for its QuickBooks product. */
function monthLines(label: string, period: Parameters<typeof draftLines>[1]): QboDraftLine[] {
  return draftLines(label, period).map((l, i) => ({ ...l, itemKey: null, projectId: null, lineKind: i === 0 ? "JAN_MONTH" : "JAN_EXTRA" }));
}

const total = (lines: { amountCents: number }[]) => lines.reduce((s, l) => s + l.amountCents, 0);

/** Makes this server's draft for a janitorial month. Skipped when the month already has one. */
export async function createMonthDraft(periodId: string): Promise<{ result: "drafted" | "skipped"; note?: string }> {
  const p = await prisma.recurringContractPeriod.findUniqueOrThrow({
    where: { id: periodId },
    include: { charges: { orderBy: { createdAt: "asc" } }, recurringContract: { select: { invoiceLabel: true, buildingId: true, building: { select: { name: true } } } } },
  });
  const label = p.recurringContract.invoiceLabel?.trim() || p.recurringContract.building.name;
  try {
    await prisma.qboInvoiceDraft.create({
      data: {
        environment: qboEnvironment(),
        kind: "MONTH",
        periodId,
        groupType: "BUILDING",
        groupId: p.recurringContract.buildingId,
        title: p.recurringContract.building.name,
        totalCents: total(monthLines(label, p)),
      },
    });
    return { result: "drafted" };
  } catch (e) {
    // The partial unique index: another run made it first.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { result: "skipped", note: "Already has a draft" };
    throw e;
  }
}

/** Makes this server's draft for picked finished work in one building or job. */
export async function createItemsDraft(group: { type: "BUILDING" | "PROJECT"; id: string; name: string }, lines: QboDraftLine[], email: string) {
  await prisma.qboInvoiceDraft.create({
    data: {
      environment: qboEnvironment(),
      kind: "ITEMS",
      groupType: group.type,
      groupId: group.id,
      title: group.name,
      lines: lines as unknown as Prisma.InputJsonValue,
      totalCents: total(lines),
      createdByEmail: email,
    },
  });
}

/** Items on this server's waiting drafts, kept off Ready to bill. */
export async function itemKeysOnQboDrafts(): Promise<Set<string>> {
  const drafts = await prisma.qboInvoiceDraft.findMany({ where: { environment: qboEnvironment(), status: "DRAFT", kind: "ITEMS" }, select: { lines: true } });
  return new Set(drafts.flatMap((d) => (d.lines as QboDraftLine[]).map((l) => l.itemKey).filter((k): k is string => !!k)));
}

/** True when this server has a live (waiting or approved) draft for the month. */
export async function monthHasQboDraft(periodId: string): Promise<boolean> {
  return (await prisma.qboInvoiceDraft.count({ where: { environment: qboEnvironment(), periodId, status: { in: ["DRAFT", "APPROVED"] } } })) > 0;
}

const draftInclude = {
  period: {
    include: {
      charges: { orderBy: { createdAt: "asc" as const } },
      recurringContract: { select: { id: true, billingDayOfMonth: true, invoiceLabel: true, buildingId: true, building: { select: { name: true } } } },
    },
  },
} as const;
type LoadedQboDraft = Prisma.QboInvoiceDraftGetPayload<{ include: typeof draftInclude }>;

function destinationOf(d: { groupType: string; groupId: string }): Promise<InvoiceDestination | null> {
  return d.groupType === "PROJECT" ? loadProjectInvoiceDestination(d.groupId) : loadBuildingInvoiceDestination(d.groupId);
}

/**
 * What the invoice says now. A month reads its amount and extras live and is
 * dated its billing day; picked work is dated the day it's approved. Due:
 * the company's terms, else the date set on the draft (not before the
 * invoice date), else due on receipt.
 */
export function draftContent(d: LoadedQboDraft, paymentTermsDays: number | null) {
  const lines =
    d.kind === "MONTH" && d.period
      ? monthLines(d.period.recurringContract.invoiceLabel?.trim() || d.period.recurringContract.building.name, d.period)
      : (d.lines as QboDraftLine[]);
  const invoiceDateKey = d.kind === "MONTH" && d.period ? billingDateKey(d.period.periodStart, d.period.recurringContract.billingDayOfMonth) : todayEasternKey();
  const setDue = d.dueDate ? utcDateKey(d.dueDate) : null;
  const dueDateKey = paymentTermsDays != null ? addDaysKey(invoiceDateKey, paymentTermsDays) : setDue && setDue > invoiceDateKey ? setDue : invoiceDateKey;
  const subtitle = d.kind === "MONTH" && d.period ? monthLabel(d.period.periodStart) : `Drafted ${d.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}`;
  return { lines, totalCents: total(lines), invoiceDateKey, dueDateKey, subtitle };
}

/** This server's waiting drafts, for Ready to send. */
export async function loadWaitingQboDrafts() {
  return prisma.qboInvoiceDraft.findMany({ where: { environment: qboEnvironment(), status: "DRAFT" }, include: draftInclude, orderBy: { createdAt: "asc" } });
}

/** Sandbox test invoices from the last 14 days, so they can be checked in the sandbox company. */
export async function loadRecentQboTests() {
  return prisma.qboInvoiceDraft.findMany({
    where: { environment: qboEnvironment(), status: "TESTED", approvedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
    orderBy: { approvedAt: "desc" },
    take: 20,
  });
}

/** Where to open an invoice in QuickBooks. */
export function qboInvoiceUrl(env: QboEnvironment, qboInvoiceId: string): string {
  return `${env === "production" ? "https://qbo.intuit.com" : "https://app.sandbox.qbo.intuit.com"}/app/invoice?txnId=${encodeURIComponent(qboInvoiceId)}`;
}

async function loadDraft(id: string) {
  return prisma.qboInvoiceDraft.findFirst({ where: { id, environment: qboEnvironment(), status: "DRAFT" }, include: draftInclude });
}

/** What "Email me a preview" needs for a waiting draft. */
export async function qboDraftForPreview(id: string) {
  const d = await loadDraft(id);
  if (!d) return null;
  const destination = await destinationOf(d);
  const c = draftContent(d, destination?.paymentTermsDays ?? null);
  const title = d.kind === "MONTH" && d.period ? `${d.title}, ${monthLabel(d.period.periodStart)}` : d.title;
  return { title, lines: c.lines.map(({ name, description, amountCents }) => ({ name, description, amountCents })), dueDateKey: c.dueDateKey, destination };
}

export async function setQboDraftDueDate(id: string, dueKey: string): Promise<{ ok: true } | { error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueKey)) return { error: "Pick a due date." };
  const d = await loadDraft(id);
  if (!d) return { error: "This draft isn't waiting anymore." };
  const terms = (await destinationOf(d))?.paymentTermsDays ?? null;
  if (terms != null) return { error: `This client has payment terms (Net ${terms}), so the due date follows them. Change the terms on the company to change it.` };
  if (dueKey < draftContent(d, null).invoiceDateKey) return { error: "The due date can't be before the invoice date." };
  await prisma.qboInvoiceDraft.update({ where: { id }, data: { dueDate: new Date(`${dueKey}T12:00:00.000Z`) } });
  return { ok: true };
}

/** Edits a month draft's base amount and extras. Saved on the month, which the draft reads live. */
export async function editQboMonthDraft(
  id: string,
  input: { amountCents: number; charges: { description: string; amountCents: number }[] },
): Promise<{ ok: true } | { error: string }> {
  const d = await loadDraft(id);
  if (!d) return { error: "This draft isn't waiting anymore." };
  if (d.kind !== "MONTH" || !d.periodId) return { error: "Only janitorial months can be edited here. Discard and draft again from Ready to bill." };
  // The month is a real row in the shared database, so sandbox tests don't change it.
  if (d.environment !== "production") return { error: "This is a sandbox test of a real month, so it can't be edited from local dev." };
  const periodId = d.periodId;
  await prisma.$transaction([
    prisma.recurringContractPeriod.update({ where: { id: periodId }, data: { amountCents: input.amountCents } }),
    prisma.recurringContractCharge.deleteMany({ where: { periodId } }),
    prisma.recurringContractCharge.createMany({ data: input.charges.map((c) => ({ ...c, periodId })) }),
  ]);
  return { ok: true };
}

/** Discards a waiting draft. Picked items go back on Ready to bill; a live month isn't drafted again unless asked. */
export async function discardQboDraft(id: string, email: string): Promise<{ ok: true } | { error: string }> {
  const d = await loadDraft(id);
  if (!d) return { error: "This draft isn't waiting anymore." };
  await prisma.qboInvoiceDraft.update({ where: { id }, data: { status: "DISCARDED", discardedAt: new Date(), discardedByEmail: email } });
  // The month's discard flag is shared with the live site, so only a live discard sets it.
  if (d.periodId && d.environment === "production") {
    await prisma.recurringContractPeriod.update({ where: { id: d.periodId }, data: { draftDiscardedAt: new Date(), draftDiscardedByEmail: email } });
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// QuickBooks lookups

type QboCustomerRow = { Id: string; DisplayName: string; ParentRef?: { value: string } };
type QboItemRow = { Id: string; Name: string; Type?: string };

/** QuickBooks query text needs quotes and backslashes escaped. */
const quote = (v: string) => `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

async function query<T>(entity: string, where: string): Promise<T[]> {
  const res = await qboGet<{ QueryResponse?: Record<string, T[] | undefined> }>(`/query?query=${encodeURIComponent(`select * from ${entity} where ${where}`)}`);
  return res.QueryResponse?.[entity] ?? [];
}

/** Customer names can't hold a colon (QuickBooks uses it between parent and sub-customer). */
const customerName = (name: string) => name.replace(/:/g, "-").replace(/\s+/g, " ").trim().slice(0, 100);

async function createCustomer(body: Record<string, unknown>, requestId: string): Promise<string> {
  const res = await qboPost<{ Customer: { Id: string } }>("/customer", body, requestId);
  return res.Customer.Id;
}

/**
 * The parent customer for the client company. Production uses the one
 * confirmed on Invoice setup, or makes one named after the company when
 * "New customer at the switch" was confirmed (and saves it). The sandbox
 * has its own customers, so it finds or makes one by name and saves nothing.
 */
async function parentCustomer(env: QboEnvironment, companyId: string, draftId: string): Promise<string> {
  const c = await prisma.clientCompany.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, qboCustomerId: true, qboConfirmedAt: true } });
  const name = customerName(c.name);
  if (env === "production") {
    if (!c.qboConfirmedAt) throw new Error(`Confirm ${c.name}'s QuickBooks customer on Invoice setup first.`);
    if (c.qboCustomerId) return c.qboCustomerId;
  }
  const found = (await query<QboCustomerRow>("Customer", `DisplayName = ${quote(name)}`))[0];
  if (found?.ParentRef) throw new Error(`QuickBooks already has "${name}" as a sub-customer. Rename one of them first.`);
  const id = found?.Id ?? (await createCustomer({ DisplayName: name, CompanyName: name }, `${draftId}-parent`));
  if (env === "production") await prisma.clientCompany.update({ where: { id: companyId }, data: { qboCustomerId: id } });
  return id;
}

/**
 * The sub-customer for the building or job under the parent: an existing
 * one with the same name (as Invoice setup shows it), else a new one billed
 * with the parent, so money owed adds up under the company.
 */
async function subCustomer(env: QboEnvironment, parentId: string, groupType: string, title: string, draftId: string): Promise<string> {
  const name = customerName(groupType === "PROJECT" ? subCustomerName(title) : title);
  if (env === "production") {
    const synced = await prisma.qboCustomer.findMany({ where: { parentQboId: parentId }, select: { qboId: true, displayName: true } });
    const hit = synced.find((c) => sameName(c.displayName, name));
    if (hit) return hit.qboId;
  }
  const found = (await query<QboCustomerRow>("Customer", `DisplayName = ${quote(name)}`))[0];
  if (found) {
    if (found.ParentRef?.value === parentId) return found.Id;
    throw new Error(`Another QuickBooks customer is already named "${name}". Rename the job or that customer, then approve.`);
  }
  return createCustomer({ DisplayName: name, ParentRef: { value: parentId }, Job: true, BillWithParent: true }, `${draftId}-sub`);
}

/**
 * The product for each kind of line. Production uses Invoice setup. The
 * sandbox looks up a product with the same name, else its generic
 * "Services".
 */
async function productsFor(env: QboEnvironment, kinds: LineKind[]): Promise<Map<LineKind, string>> {
  const row = await prisma.appSetting.findUnique({ where: { key: QBO_ITEM_MAP_KEY } });
  const map = (row ? JSON.parse(row.value) : {}) as Partial<Record<LineKind, { qboItemId: string }>>;
  const out = new Map<LineKind, string>();
  for (const kind of new Set(kinds)) {
    const label = LINE_KINDS.find((k) => k.key === kind)!.label;
    const realId = map[kind]?.qboItemId;
    if (env === "production") {
      if (!realId) throw new Error(`Set the QuickBooks product for ${label} on Invoice setup first.`);
      out.set(kind, realId);
      continue;
    }
    const realName = realId ? (await prisma.qboItem.findUnique({ where: { qboId: realId }, select: { name: true } }))?.name : null;
    const hit = (realName ? (await query<QboItemRow>("Item", `Name = ${quote(realName)}`))[0] : undefined) ?? (await query<QboItemRow>("Item", `Name = 'Services'`))[0];
    if (!hit) throw new Error(`The sandbox has no product for ${label} and no "Services" product.`);
    out.set(kind, hit.Id);
  }
  return out;
}

/**
 * The next INV-xxxx for this environment. The first time, it starts after
 * the highest number seen in QuickBooks or HubSpot; the cutover can set it.
 */
/** The highest INV-xxxx seen in QuickBooks or HubSpot (1000 when none). */
async function highestInvoiceNumber(): Promise<number> {
  const [row] = await prisma.$queryRaw<{ n: number | null }[]>`
    SELECT max(n)::int AS n FROM (
      SELECT substring("docNumber" from '^INV-(\\d+)$')::int AS n FROM "QboInvoice"
      UNION ALL SELECT substring("invoiceNumber" from '^INV-(\\d+)$')::int FROM "HubSpotUnitInvoice"
      UNION ALL SELECT substring("invoiceNumber" from '^INV-(\\d+)$')::int FROM "HubSpotSovInvoice"
      UNION ALL SELECT substring("invoiceNumber" from '^INV-(\\d+)$')::int FROM "HubSpotContractInvoice"
    ) x`;
  return row?.n ?? 1000;
}

async function nextInvoiceNumber(env: QboEnvironment): Promise<string> {
  const key = counterKey(env);
  if (!(await prisma.appSetting.findUnique({ where: { key } }))) {
    await prisma.appSetting.createMany({ data: [{ key, value: String((await highestInvoiceNumber()) + 1) }], skipDuplicates: true });
  }
  // One statement, so two approvals at once never get the same number.
  const [taken] = await prisma.$queryRaw<{ n: number }[]>`
    UPDATE "AppSetting" SET "value" = ("value"::int + 1)::text WHERE "key" = ${key} RETURNING ("value"::int - 1) AS n`;
  return `INV-${taken!.n}`;
}

/** The project's main contact, for "Attention" on the invoice. Buildings have none. */
async function attentionFor(groupType: string, groupId: string): Promise<string | null> {
  if (groupType !== "PROJECT") return null;
  const c = await prisma.projectContact.findFirst({ where: { projectId: groupId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { fullName: true } });
  return c?.fullName.trim() || null;
}

/** QuickBooks takes up to 100 characters of addresses; past that, the first one only. */
function emailField(addresses: string[]) {
  if (!addresses.length) return undefined;
  const all = addresses.join(", ");
  return { Address: all.length <= 100 ? all : addresses[0]! };
}

type QboInvoiceResult = { Invoice: { Id: string; DocNumber?: string; TotalAmt: number; Balance: number } };

/** The client's view and pay page, when QuickBooks Payments is on for the company. Null otherwise. */
async function payLink(qboInvoiceId: string): Promise<string | null> {
  try {
    const res = await qboGet<{ Invoice?: { InvoiceLink?: string } }>(`/invoice/${encodeURIComponent(qboInvoiceId)}?include=invoiceLink`);
    return res.Invoice?.InvoiceLink || null;
  } catch {
    return null;
  }
}

/**
 * Approve: creates the invoice in QuickBooks. Safe to click again after a
 * failure: the number is kept on the draft and every write has a request id,
 * so QuickBooks never makes a second customer or invoice.
 */
export async function approveQboDraft(id: string, email: string): Promise<{ ok: true; number: string; delivery: string } | { error: string }> {
  const env = qboEnvironment();
  const d = await loadDraft(id);
  if (!d) return { error: "This draft isn't waiting anymore." };
  const conn = await loadQboConnection();
  if (!conn || conn.status !== "CONNECTED") return { error: "QuickBooks isn't connected. Connect it on the QuickBooks page." };

  const dest = await destinationOf(d);
  if (!dest?.company) return { error: `${d.title} has no client company. Set one on the ${d.groupType === "PROJECT" ? "job" : "building"}, then approve.` };
  const { lines, totalCents, invoiceDateKey, dueDateKey } = draftContent(d, dest.paymentTermsDays);
  if (!lines.length) return { error: "This draft has no lines." };
  if (totalCents < 0) return { error: "The invoice can't total less than $0." };

  let created: QboInvoiceResult["Invoice"];
  let customerId: string;
  let number: string;
  try {
    const parentId = await parentCustomer(env, dest.company.id, d.id);
    customerId = await subCustomer(env, parentId, d.groupType, d.title, d.id);
    const products = await productsFor(env, lines.map((l) => l.lineKind));
    number = d.invoiceNumber ?? (await nextInvoiceNumber(env));
    if (!d.invoiceNumber) await prisma.qboInvoiceDraft.update({ where: { id: d.id }, data: { invoiceNumber: number } });
    const attention = await attentionFor(d.groupType, d.groupId);
    const res = await qboPost<QboInvoiceResult>(
      "/invoice",
      {
        CustomerRef: { value: customerId },
        DocNumber: number,
        TxnDate: invoiceDateKey,
        DueDate: dueDateKey,
        BillEmail: emailField(dest.sendTo.value),
        BillEmailCc: emailField(dest.cc.value),
        CustomerMemo: attention ? { value: `Attention: ${attention}` } : undefined,
        PrivateNote: `Made by the Sueep ERP, approved by ${email}.`,
        // No sales tax on ERP invoices (decision 4).
        Line: lines.map((l) => ({
          DetailType: "SalesItemLineDetail",
          Amount: l.amountCents / 100,
          Description: `${l.name} - ${l.description}`.slice(0, 4000),
          SalesItemLineDetail: { ItemRef: { value: products.get(l.lineKind)! }, Qty: 1, UnitPrice: l.amountCents / 100, TaxCodeRef: { value: "NON" } },
        })),
      },
      d.id,
    );
    created = res.Invoice;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  const savedNumber = created.DocNumber ?? number;
  const totalSeen = Math.round(created.TotalAmt * 100);
  const approved = { qboInvoiceId: created.Id, invoiceNumber: savedNumber, qboCustomerId: customerId, approvedAt: new Date(), approvedByEmail: email, totalCents };
  const check = totalSeen === totalCents ? "" : ` QuickBooks shows ${(totalSeen / 100).toFixed(2)}, not ${(totalCents / 100).toFixed(2)}. Check it there.`;

  const forDelivery: InvoiceForDelivery = {
    hubspotInvoiceId: null,
    qboInvoiceId: created.Id,
    number: savedNumber,
    title: d.kind === "MONTH" && d.period ? `${d.title}, ${monthLabel(d.period.periodStart)}` : d.title,
    totalCents,
    dueDate: `${dueDateKey}T12:00:00.000Z`,
    viewUrl: await payLink(created.Id),
    pdfUrl: null,
    lines: lines.map(({ name, description, amountCents }) => ({ name, description, amountCents })),
    destType: d.groupType === "PROJECT" ? "PROJECT" : "BUILDING",
    destId: d.groupId,
    link: d.kind === "MONTH" && d.period ? `/erp/janitorial/contracts/${d.period.recurringContract.id}` : d.groupType === "PROJECT" ? `/erp/projects/${d.groupId}` : `/erp/buildings/${d.groupId}`,
  };

  if (env !== "production") {
    await prisma.qboInvoiceDraft.update({ where: { id: d.id }, data: { ...approved, status: "TESTED" } });
    const sent = await emailSandboxTest(forDelivery, email);
    return { ok: true, number: savedNumber, delivery: `Made in the QuickBooks sandbox. Nothing in the ERP was marked billed. ${sent}${check}` };
  }

  // Production: link the work to the new invoice and mark it Billed.
  const link = {
    ...QUICKBOOKS_LINKS,
    qboInvoiceId: created.Id,
    invoiceNumber: savedNumber,
    status: "open",
    invoiceDate: new Date(`${invoiceDateKey}T12:00:00.000Z`),
    dueDate: new Date(`${dueDateKey}T12:00:00.000Z`),
    invoiceTotalCents: totalSeen,
    balanceDueCents: Math.round(created.Balance * 100),
    linkedByName: "ERP invoice",
  };
  const writes: Prisma.PrismaPromise<unknown>[] = [prisma.qboInvoiceDraft.update({ where: { id: d.id }, data: { ...approved, status: "APPROVED" } })];
  const units: { turnoverRequestId: string }[] = [];
  const sov: { projectId: string; sovItemId: string | null; changeOrderId: string | null }[] = [];
  if (d.kind === "MONTH" && d.periodId) {
    writes.push(
      prisma.hubSpotContractInvoice.create({ data: { ...link, periodId: d.periodId, amountCents: totalCents, approvedAt: new Date(), approvedByEmail: email } }),
      prisma.recurringContractPeriod.updateMany({ where: { id: d.periodId, billingStatus: "NOT_BILLED" }, data: { billingStatus: "BILLED", draftError: null, draftErrorAt: null } }),
    );
  }
  for (const l of lines) {
    if (!l.itemKey) continue;
    const [kind, itemId] = l.itemKey.split(":") as [string, string];
    if (kind === "TURN") {
      const tr = await prisma.turnoverRequest.findUniqueOrThrow({ where: { id: itemId }, select: { buildingId: true, unitNumber: true } });
      writes.push(prisma.hubSpotUnitInvoice.create({ data: { ...link, manual: true, buildingId: tr.buildingId!, unitNumber: tr.unitNumber!, turnoverRequestId: itemId, amountCents: l.amountCents } }));
      units.push({ turnoverRequestId: itemId });
    } else {
      const ids = kind === "SOV" ? { sovItemId: itemId, changeOrderId: null } : { sovItemId: null, changeOrderId: itemId };
      writes.push(prisma.hubSpotSovInvoice.create({ data: { ...link, manual: true, projectId: l.projectId!, ...ids, amountCents: l.amountCents } }));
      sov.push({ projectId: l.projectId!, ...ids });
    }
  }
  await prisma.$transaction(writes);
  await markItemsBilled(units, sov);
  const delivery = await deliverApprovedInvoice(forDelivery, email);
  return { ok: true, number: savedNumber, delivery: `${delivery}${check}` };
}
