/**
 * Where an invoice goes and why. Each field is taken from the most specific
 * level that sets it: the project's override, then the building's override,
 * then the client company's billing profile. Later phases (auto-drafted
 * invoices, delivery) use this so the answer is the same everywhere.
 *
 * The client company is the project's own clientCompanyId, else the
 * building's managing company.
 */
import { prisma } from "@/lib/prisma";
import {
  isBillingFrequency,
  isBillingMethod,
  overrideFromColumns,
  type BillingFrequency,
  type BillingMethod,
  type BillingOverride,
} from "./clientCompanies";

export type DestinationSource = "project" | "building" | "company";

export type Sourced<T> = { value: T; source: DestinationSource | null; sourceName: string | null };

export type InvoiceDestination = {
  company: { id: string; name: string; via: "project" | "building" } | null;
  method: Sourced<BillingMethod | null>;
  sendTo: Sourced<string[]>;
  cc: Sourced<string[]>;
  portalUrl: Sourced<string | null>;
  /** Company instructions plus any building/project notes, most specific last */
  notes: { source: DestinationSource; sourceName: string; text: string }[];
  /** Company-level terms (no overrides for these) */
  cutoffDay: number | null;
  cutoffNote: string | null;
  frequency: BillingFrequency | null;
  paymentTermsDays: number | null;
};

type Level = { source: DestinationSource; name: string; method: BillingMethod | null; portalUrl: string | null; sendTo: string[]; cc: string[]; note: string | null };

type CompanyForDestination = {
  id: string;
  name: string;
  billingMethod: string | null;
  billingPortalUrl: string | null;
  billingSendTo: string[];
  billingCc: string[];
  billingInstructions: string | null;
  billingCutoffDay: number | null;
  billingCutoffNote: string | null;
  billingFrequency: string | null;
  paymentTermsDays: number | null;
};

function pick<T>(levels: Level[], get: (l: Level) => T, isSet: (v: T) => boolean, empty: T): Sourced<T> {
  for (const l of levels) {
    const v = get(l);
    if (isSet(v)) return { value: v, source: l.source, sourceName: l.name };
  }
  return { value: empty, source: null, sourceName: null };
}

/** Pure part, so it can be checked without a database. */
export function resolveInvoiceDestination(input: {
  project?: { name: string; override: BillingOverride } | null;
  building?: { name: string; override: BillingOverride } | null;
  company: CompanyForDestination | null;
  companyVia: "project" | "building" | null;
}): InvoiceDestination {
  const { project, building, company } = input;
  const levels: Level[] = [];
  if (project) levels.push({ source: "project", name: project.name, ...project.override });
  if (building) levels.push({ source: "building", name: building.name, ...building.override });
  if (company) {
    levels.push({
      source: "company",
      name: company.name,
      method: isBillingMethod(company.billingMethod) ? company.billingMethod : null,
      portalUrl: company.billingPortalUrl,
      sendTo: company.billingSendTo,
      cc: company.billingCc,
      note: company.billingInstructions,
    });
  }
  return {
    company: company && input.companyVia ? { id: company.id, name: company.name, via: input.companyVia } : null,
    method: pick(levels, (l) => l.method, (v) => v != null, null),
    sendTo: pick(levels, (l) => l.sendTo, (v) => v.length > 0, [] as string[]),
    cc: pick(levels, (l) => l.cc, (v) => v.length > 0, [] as string[]),
    portalUrl: pick(levels, (l) => l.portalUrl, (v) => !!v, null),
    notes: [...levels].reverse().flatMap((l) => (l.note ? [{ source: l.source, sourceName: l.name, text: l.note }] : [])),
    cutoffDay: company?.billingCutoffDay ?? null,
    cutoffNote: company?.billingCutoffNote ?? null,
    frequency: isBillingFrequency(company?.billingFrequency) ? company.billingFrequency : null,
    paymentTermsDays: company?.paymentTermsDays ?? null,
  };
}

const companySelect = {
  id: true,
  name: true,
  billingMethod: true,
  billingPortalUrl: true,
  billingSendTo: true,
  billingCc: true,
  billingInstructions: true,
  billingCutoffDay: true,
  billingCutoffNote: true,
  billingFrequency: true,
  paymentTermsDays: true,
} as const;

const overrideSelect = {
  billingOverrideMethod: true,
  billingOverridePortalUrl: true,
  billingOverrideSendTo: true,
  billingOverrideCc: true,
  billingOverrideNote: true,
} as const;

export async function loadProjectInvoiceDestination(projectId: string): Promise<InvoiceDestination | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      jobTitle: true,
      billingCutoffDay: true,
      ...overrideSelect,
      clientCompany: { select: companySelect },
      building: { select: { name: true, ...overrideSelect, managedByCompany: { select: companySelect } } },
    },
  });
  if (!p) return null;
  const company = p.clientCompany ?? p.building?.managedByCompany ?? null;
  const d = resolveInvoiceDestination({
    project: { name: p.jobTitle, override: overrideFromColumns(p) },
    building: p.building ? { name: p.building.name, override: overrideFromColumns(p.building) } : null,
    company,
    companyVia: p.clientCompany ? "project" : company ? "building" : null,
  });
  // A job's own billing cutoff wins over the company's.
  return p.billingCutoffDay != null ? { ...d, cutoffDay: p.billingCutoffDay } : d;
}

export async function loadBuildingInvoiceDestination(buildingId: string): Promise<InvoiceDestination | null> {
  const b = await prisma.building.findUnique({
    where: { id: buildingId },
    select: { name: true, ...overrideSelect, managedByCompany: { select: companySelect } },
  });
  if (!b) return null;
  return resolveInvoiceDestination({
    building: { name: b.name, override: overrideFromColumns(b) },
    company: b.managedByCompany,
    companyVia: b.managedByCompany ? "building" : null,
  });
}
