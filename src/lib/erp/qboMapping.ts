import { prisma } from "@/lib/prisma";

/**
 * Invoice setup for the ERP sending invoices to QuickBooks
 * (ERP_QBO_INVOICING_PLAN.md Phase 1). Read-only toward QuickBooks:
 * - each client company gets its QuickBooks customer, suggested by name and
 *   confirmed by a person (ClientCompany.qboCustomerId);
 * - each job or building gets a sub-customer under it, an existing one with
 *   the same name or a new one made at the switch (worked out, not stored);
 * - each kind of invoice line gets a QuickBooks product (AppSetting).
 * Customers and products come from the nightly sync (QboCustomer, QboItem).
 */

export const QBO_ITEM_MAP_KEY = "qboItemMap";

/** The kinds of line the ERP puts on an invoice (Ready to send). */
export const LINE_KINDS = [
  { key: "TURN", label: "Turnovers", example: "Turn Over, Unit 14", words: ["turn"] },
  { key: "SOV", label: "Post-construction lines", example: "Final Cleaning Building 3", words: ["post", "construction", "final", "rough"] },
  { key: "CO", label: "Change orders", example: "Change order on a job", words: ["change"] },
  { key: "JAN_MONTH", label: "Janitorial month", example: "Recurring cleaning, monthly", words: ["janitorial", "recurring"] },
  { key: "JAN_EXTRA", label: "Janitorial extras", example: "Extra charge on a janitorial month", words: ["janitorial", "additional", "extra"] },
] as const;
export type LineKind = (typeof LINE_KINDS)[number]["key"];
export const isLineKind = (v: unknown): v is LineKind => LINE_KINDS.some((k) => k.key === v);

type ItemMap = Partial<Record<LineKind, { qboItemId: string; byEmail: string | null; at: string }>>;

// Words that don't tell two companies apart ("Ingerman" is "Ingerman Construction").
const FILLER = new Set(["inc", "llc", "co", "corp", "corporation", "company", "the", "group", "management", "construction", "constructors", "properties", "and", "of"]);

export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w));
}

export const sameName = (a: string, b: string) => {
  const x = nameWords(a).join(" ");
  return x !== "" && x === nameWords(b).join(" ");
};

type CustomerLite = { qboId: string; displayName: string; parentQboId: string | null };

/**
 * The best top-level QuickBooks customer for a company, or null. Every
 * significant word of the company name (or an alias) has to be in the
 * customer's name; the closest-length name wins, so "UDR" picks "UDR Inc"
 * over "UDR Inc - Someone".
 */
export function suggestCustomer(company: { name: string; aliases: string[] }, customers: CustomerLite[]): CustomerLite | null {
  let best: { c: CustomerLite; extra: number } | null = null;
  for (const c of customers) {
    if (c.parentQboId) continue;
    const have = new Set(nameWords(c.displayName));
    for (const n of [company.name, ...company.aliases]) {
      const want = nameWords(n);
      if (!want.length || !want.every((w) => have.has(w))) continue;
      const extra = have.size - want.length;
      if (!best || extra < best.extra) best = { c, extra };
    }
  }
  return best?.c ?? null;
}

/** The best product for a kind of line: the most of its words in the product name. */
export function suggestItem(kind: LineKind, items: { qboId: string; name: string; type: string | null }[]) {
  const words = LINE_KINDS.find((k) => k.key === kind)!.words;
  let best: { i: (typeof items)[number]; hits: number } | null = null;
  for (const i of items) {
    if (i.type === "Category" || i.type === "Group") continue;
    const name = i.name.toLowerCase();
    const hits = words.filter((w) => name.includes(w)).length;
    if (hits && (!best || hits > best.hits)) best = { i, hits };
  }
  return best?.i ?? null;
}

/**
 * "Carusi Middle School - 315 Roosevelt Dr - Newport Construction" reads
 * "Carusi Middle School", and "EW Rhodes Elementary School, 2900 W
 * Clearfield Street" drops the address. QuickBooks allows 100 characters.
 */
export function subCustomerName(name: string): string {
  return (name.split(" - ")[0] ?? name).split(/,\s*(?=\d)/)[0].trim().slice(0, 100);
}

const RECENT_DAYS = 120;

export type MappingCompany = {
  id: string;
  name: string;
  /** Confirmed customer, or the suggestion while not confirmed */
  qboCustomerId: string | null;
  confirmed: boolean;
  confirmedBy: string | null;
  suggested: boolean;
  jobs: number;
};

export type MappingGroup = {
  key: string;
  kind: "BUILDING" | "JOB";
  name: string;
  href: string;
  companyId: string | null;
  companyName: string | null;
  /** What QuickBooks will show: "Parent:Child" */
  plannedName: string | null;
  /** An existing sub-customer with the same name under the company's customer */
  existing: boolean;
  /** Another QuickBooks customer already uses the name, so a new one can't be made with it */
  nameTaken: boolean;
  /** How many ERP jobs share this sub-customer */
  count: number;
};

export type MappingLine = { key: LineKind; label: string; example: string; qboItemId: string | null; confirmed: boolean; suggested: boolean };

export type QboMapping = {
  synced: boolean;
  syncedAt: string | null;
  customers: { qboId: string; label: string }[];
  items: { qboId: string; label: string }[];
  companies: MappingCompany[];
  groups: MappingGroup[];
  lines: MappingLine[];
};

/**
 * Jobs and buildings that will get invoices after the switch: buildings
 * with a janitorial contract or a turn in the last 120 days, and jobs that
 * aren't complete or changed in the last 120 days (turn jobs bill under
 * their building).
 */
async function loadInvoiceGroups() {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
  const [buildings, jobs] = await Promise.all([
    prisma.building.findMany({
      where: { OR: [{ recurringContract: { isNot: null } }, { turnoverRequests: { some: { createdAt: { gte: since } } } }] },
      select: { id: true, name: true, managedByCompany: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({
      where: { turnoverRequestId: null, OR: [{ status: { not: "COMPLETE" } }, { updatedAt: { gte: since } }] },
      select: {
        id: true,
        jobTitle: true,
        clientCompany: { select: { id: true, name: true } },
        building: { select: { managedByCompany: { select: { id: true, name: true } } } },
      },
    }),
  ]);
  return [
    ...buildings.map((b) => ({ kind: "BUILDING" as const, id: b.id, name: b.name, href: `/erp/buildings/${b.id}`, company: b.managedByCompany })),
    // Same company rule as invoiceDestination.ts: the job's own client company, else its building's.
    ...jobs.map((j) => ({
      kind: "JOB" as const,
      id: j.id,
      name: subCustomerName(j.jobTitle),
      href: `/erp/projects/${j.id}`,
      company: j.clientCompany ?? j.building?.managedByCompany ?? null,
    })),
  ];
}

export async function loadQboMapping(): Promise<QboMapping> {
  const [customers, items, companies, groups, itemSetting, lastImport] = await Promise.all([
    prisma.qboCustomer.findMany({ orderBy: { fullyQualifiedName: "asc" } }),
    prisma.qboItem.findMany({ orderBy: { name: "asc" } }),
    prisma.clientCompany.findMany({ where: { archived: false }, select: { id: true, name: true, aliases: true, qboCustomerId: true, qboConfirmedAt: true, qboConfirmedByEmail: true } }),
    loadInvoiceGroups(),
    prisma.appSetting.findUnique({ where: { key: QBO_ITEM_MAP_KEY } }),
    prisma.qboImport.findFirst({ where: { kind: "CUSTOMERS" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const byId = new Map(customers.map((c) => [c.qboId, c]));

  // Only companies that have work in the ERP need a customer.
  const jobsByCompany = new Map<string, number>();
  for (const g of groups) if (g.company) jobsByCompany.set(g.company.id, (jobsByCompany.get(g.company.id) ?? 0) + 1);
  const companyRows: MappingCompany[] = companies
    .filter((c) => jobsByCompany.has(c.id) || c.qboConfirmedAt)
    .map((c) => {
      const confirmed = !!c.qboConfirmedAt;
      const suggestion = confirmed ? null : suggestCustomer(c, customers);
      return {
        id: c.id,
        name: c.name,
        qboCustomerId: confirmed ? (c.qboCustomerId && byId.has(c.qboCustomerId) ? c.qboCustomerId : null) : (suggestion?.qboId ?? null),
        confirmed,
        confirmedBy: c.qboConfirmedByEmail,
        suggested: !!suggestion,
        jobs: jobsByCompany.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => Number(a.confirmed) - Number(b.confirmed) || a.name.localeCompare(b.name));
  const parentFor = new Map(companyRows.map((c) => [c.id, c.qboCustomerId ? byId.get(c.qboCustomerId)! : null]));
  const companyName = new Map(companyRows.map((c) => [c.id, c.name]));

  // One sub-customer per company and name; jobs with the same short name share it.
  const merged = new Map<string, MappingGroup>();
  for (const g of groups) {
    const key = `${g.company?.id ?? "-"}|${nameWords(g.name).join(" ") || g.name}`;
    const hit = merged.get(key);
    if (hit) {
      hit.count++;
      continue;
    }
    const parent = g.company ? parentFor.get(g.company.id) ?? null : null;
    const existing = parent ? customers.find((c) => c.parentQboId === parent.qboId && sameName(c.displayName, g.name)) : undefined;
    merged.set(key, {
      key: `${g.kind}:${g.id}`,
      kind: g.kind,
      name: g.name,
      href: g.href,
      companyId: g.company?.id ?? null,
      companyName: g.company ? companyName.get(g.company.id) ?? g.company.name : null,
      plannedName: existing ? existing.fullyQualifiedName : parent ? `${parent.displayName}:${g.name}` : g.company ? `${g.company.name}:${g.name}` : null,
      existing: !!existing,
      // QuickBooks display names are unique across every customer.
      nameTaken: !existing && customers.some((c) => c.displayName.toLowerCase() === g.name.toLowerCase()),
      count: 1,
    });
  }
  const groupRows = [...merged.values()].sort(
    (a, b) => Number(!!a.companyId) - Number(!!b.companyId) || (a.companyName ?? "").localeCompare(b.companyName ?? "") || a.name.localeCompare(b.name),
  );

  const map = parseItemMap(itemSetting?.value);
  const itemIds = new Set(items.map((i) => i.qboId));
  const lines: MappingLine[] = LINE_KINDS.map((k) => {
    const saved = map[k.key];
    const suggestion = saved ? null : suggestItem(k.key, items);
    return {
      key: k.key,
      label: k.label,
      example: k.example,
      qboItemId: saved ? (itemIds.has(saved.qboItemId) ? saved.qboItemId : null) : (suggestion?.qboId ?? null),
      confirmed: !!saved,
      suggested: !!suggestion,
    };
  });

  return {
    synced: customers.length > 0,
    syncedAt: lastImport?.createdAt.toISOString() ?? null,
    customers: customers.map((c) => ({ qboId: c.qboId, label: c.fullyQualifiedName })),
    items: items.filter((i) => i.type !== "Category" && i.type !== "Group").map((i) => ({ qboId: i.qboId, label: i.name })),
    companies: companyRows,
    groups: groupRows,
    lines,
  };
}

function parseItemMap(value: string | undefined): ItemMap {
  if (!value) return {};
  try {
    const v = JSON.parse(value) as ItemMap;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Confirms a company's customer; null means a new customer is made at the switch. */
export async function setCompanyCustomer(companyId: string, qboCustomerId: string | null, email: string | null) {
  if (qboCustomerId) {
    const c = await prisma.qboCustomer.findUnique({ where: { qboId: qboCustomerId }, select: { parentQboId: true } });
    if (!c) return { error: "That customer isn't in QuickBooks anymore. Pick another." };
    if (c.parentQboId) return { error: "Pick a main customer, not a sub-customer." };
  }
  await prisma.clientCompany.update({
    where: { id: companyId },
    data: { qboCustomerId, qboConfirmedAt: new Date(), qboConfirmedByEmail: email },
  });
  return { ok: true as const };
}

/** Undoes a confirmation, so the suggestion shows again. */
export async function clearCompanyCustomer(companyId: string) {
  await prisma.clientCompany.update({ where: { id: companyId }, data: { qboCustomerId: null, qboConfirmedAt: null, qboConfirmedByEmail: null } });
  return { ok: true as const };
}

/** Sets the product for a kind of line, or clears it with null. */
export async function setLineItem(kind: LineKind, qboItemId: string | null, email: string | null) {
  if (qboItemId && !(await prisma.qboItem.findUnique({ where: { qboId: qboItemId }, select: { id: true } }))) {
    return { error: "That product isn't in QuickBooks anymore. Pick another." };
  }
  const row = await prisma.appSetting.findUnique({ where: { key: QBO_ITEM_MAP_KEY } });
  const map = parseItemMap(row?.value);
  if (qboItemId) map[kind] = { qboItemId, byEmail: email, at: new Date().toISOString() };
  else delete map[kind];
  const value = JSON.stringify(map);
  await prisma.appSetting.upsert({ where: { key: QBO_ITEM_MAP_KEY }, create: { key: QBO_ITEM_MAP_KEY, value }, update: { value } });
  return { ok: true as const };
}
