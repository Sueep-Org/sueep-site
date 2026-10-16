import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditCompanies, canManageCompanyInfo, canViewCompanies } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import {
  BILLING_FREQUENCY_LABELS,
  BILLING_METHOD_LABELS,
  COMPANY_TYPE_LABELS,
  isBillingFrequency,
  isBillingMethod,
  isCompanyType,
} from "@/lib/erp/clientCompanies";
import { toContactRow } from "@/lib/erp/clientCompaniesServer";
import { utcDateKey } from "@/lib/erp/dates";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { CompanyEditButton, ContactsSection, LinksSection, PortalLoginsSection, ProjectsSection } from "./CompanyDetailClient";
import { GcScorecard } from "./GcScorecard";

export const metadata: Metadata = { title: "Company" };
export const dynamic = "force-dynamic";

const PROJECT_LIMIT = 50;

function fmtDate(d: Date | null): string {
  if (!d) return "Start unknown";
  const [y, m, day] = utcDateKey(d).split("-").map(Number);
  return new Date(y!, m! - 1, day!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canViewCompanies(auth.role)) redirect("/erp");
  const { id } = await params;
  const canEdit = canEditCompanies(auth.role);
  // Logins live on Company Info, so the same roles see them here.
  const showLogins = canManageCompanyInfo(auth.role);

  const company = await prisma.clientCompany.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: { name: "asc" } },
      managedBuildings: { select: { id: true, name: true, address: true }, orderBy: { name: "asc" } },
      ownedBuildings: { select: { id: true, name: true, address: true }, orderBy: { name: "asc" } },
      managementHistory: { where: { toDate: { not: null } }, include: { building: { select: { id: true, name: true } } }, orderBy: { toDate: "desc" } },
      projects: { select: { id: true, jobTitle: true, status: true }, orderBy: { createdAt: "desc" }, take: PROJECT_LIMIT },
      propertyManagers: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } },
      coiHolders: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      loginLinks: {
        select: { loginId: true, login: { select: { id: true, name: true, url: true, username: true, passwordEncrypted: true } } },
        orderBy: { login: { name: "asc" } },
      },
      _count: { select: { projects: true } },
    },
  });
  if (!company) notFound();

  // Post-construction jobs get linked here (janitorial jobs follow their building).
  const postConPipelineId = parseHubSpotPipelineStageMap()?.postConstruction.pipelineId ?? null;
  const [viaBuildingCount, loginOptions, pmOptions, coiOptions, projectOptions] = await Promise.all([
    prisma.project.count({ where: { clientCompanyId: null, building: { managedByCompanyId: id } } }),
    showLogins && canEdit ? prisma.companyLogin.findMany({ select: { id: true, name: true, username: true }, orderBy: { name: "asc" } }) : [],
    canEdit ? prisma.propertyManager.findMany({ select: { id: true, name: true, company: true }, orderBy: { name: "asc" } }) : [],
    canEdit ? prisma.coiHolder.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    prisma.project.findMany({
      where: {
        turnoverRequestId: null,
        recurringContractPeriodId: null,
        // NOT alone would also drop rows with no client, which are the ones to add.
        OR: [{ clientCompanyId: null }, { clientCompanyId: { not: id } }],
        ...(postConPipelineId ? { hubspotPipelineId: postConPipelineId } : {}),
      },
      select: { id: true, jobTitle: true, status: true, clientCompany: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const type = isCompanyType(company.type) ? company.type : "PROPERTY_MANAGER";
  const method = isBillingMethod(company.billingMethod) ? company.billingMethod : null;
  const frequency = isBillingFrequency(company.billingFrequency) ? company.billingFrequency : null;

  const billingRows: [string, React.ReactNode][] = [
    ["Method", method ? BILLING_METHOD_LABELS[method] : null],
    ["Send to", company.billingSendTo.join(", ") || null],
    ["Cc", company.billingCc.join(", ") || null],
    [
      "Portal",
      company.billingPortalUrl ? (
        <a href={company.billingPortalUrl} target="_blank" rel="noreferrer" className="text-pink-600 hover:underline">
          {company.billingPortalUrl}
        </a>
      ) : null,
    ],
    ["How often", frequency ? BILLING_FREQUENCY_LABELS[frequency] : null],
    ["Cutoff", company.billingCutoffDay ? `Day ${company.billingCutoffDay}${company.billingCutoffNote ? `, ${company.billingCutoffNote}` : ""}` : company.billingCutoffNote],
    ["Terms", company.paymentTermsDays != null ? `Net ${company.paymentTermsDays}` : null],
    ["Instructions", company.billingInstructions],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/companies" className="text-xs text-pink-600 hover:underline">
          Back to companies
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-900">{company.name}</h1>
          <span className="rounded-full bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700">{COMPANY_TYPE_LABELS[type]}</span>
          {company.archived && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Archived</span>}
          {canEdit && (
            <div className="ml-auto">
              <CompanyEditButton
                company={{
                  id: company.id,
                  name: company.name,
                  type,
                  aliases: company.aliases,
                  notes: company.notes,
                  archived: company.archived,
                  billingMethod: method,
                  billingPortalUrl: company.billingPortalUrl,
                  billingSendTo: company.billingSendTo,
                  billingCc: company.billingCc,
                  billingCutoffDay: company.billingCutoffDay,
                  billingCutoffNote: company.billingCutoffNote,
                  billingFrequency: frequency,
                  paymentTermsDays: company.paymentTermsDays,
                  billingInstructions: company.billingInstructions,
                }}
              />
            </div>
          )}
        </div>
        {company.aliases.length > 0 && <p className="mt-1 text-sm text-gray-500">Also: {company.aliases.join(", ")}</p>}
        {company.notes && <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{company.notes}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GcScorecard companyId={company.id} />
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            Billing
            <InfoTip text="The default for every building and project of theirs. A building or project can override any line." />
          </h2>
          <dl className="mt-2 space-y-1">
            {billingRows.map(([label, value]) => (
              <div key={label} className="flex gap-2 text-sm">
                <dt className="w-24 shrink-0 text-xs leading-5 text-gray-500">{label}</dt>
                <dd className="min-w-0 whitespace-pre-line break-words text-gray-900">{value ?? <span className="text-gray-400">Not set</span>}</dd>
              </div>
            ))}
          </dl>
        </section>

        <ContactsSection companyId={company.id} contacts={company.contacts.map(toContactRow)} canEdit={canEdit} />

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            Buildings
            <InfoTip text="Set on each building's Details tab. Past ones stay listed with their end date." />
          </h2>
          {company.managedBuildings.length + company.ownedBuildings.length + company.managementHistory.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No buildings linked yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {company.managedBuildings.map((b) => (
                <li key={`m-${b.id}`} className="flex justify-between gap-2 py-1.5">
                  <Link href={`/erp/buildings/${b.id}`} className="font-medium text-gray-900 hover:text-pink-600">
                    {b.name}
                  </Link>
                  <span className="text-xs text-gray-500">Manages</span>
                </li>
              ))}
              {company.ownedBuildings.map((b) => (
                <li key={`o-${b.id}`} className="flex justify-between gap-2 py-1.5">
                  <Link href={`/erp/buildings/${b.id}`} className="font-medium text-gray-900 hover:text-pink-600">
                    {b.name}
                  </Link>
                  <span className="text-xs text-gray-500">Owns</span>
                </li>
              ))}
              {company.managementHistory.map((h) => (
                <li key={h.id} className="flex justify-between gap-2 py-1.5 text-gray-500">
                  <Link href={`/erp/buildings/${h.building.id}`} className="hover:text-pink-600">
                    {h.building.name}
                  </Link>
                  <span className="text-xs">
                    Managed {fmtDate(h.fromDate)} to {fmtDate(h.toDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ProjectsSection
          companyId={company.id}
          projects={company.projects.map((p) => ({ id: p.id, jobTitle: p.jobTitle, status: p.status }))}
          totalCount={company._count.projects}
          viaBuildingCount={viaBuildingCount}
          options={projectOptions.map((p) => ({
            value: p.id,
            label: `${p.jobTitle} (${p.status.toLowerCase()})${p.clientCompany ? `, now ${p.clientCompany.name}` : ""}`,
          }))}
        />

        <LinksSection
          companyId={company.id}
          canEdit={canEdit}
          propertyManagers={company.propertyManagers.map((m) => ({ id: m.id, label: m.name, sub: m.email }))}
          coiHolders={company.coiHolders.map((h) => ({ id: h.id, label: h.name, sub: null }))}
          pmOptions={pmOptions.map((m) => ({ value: m.id, label: m.company ? `${m.name} (${m.company})` : m.name }))}
          coiOptions={coiOptions.map((h) => ({ value: h.id, label: h.name }))}
        />
      </div>

      {showLogins && (
        <PortalLoginsSection
          companyId={company.id}
          canLink={canEdit}
          logins={company.loginLinks.map(({ login: l }) => ({ id: l.id, name: l.name, url: l.url, username: l.username, hasPassword: !!l.passwordEncrypted }))}
          options={loginOptions
            .filter((l) => !company.loginLinks.some((k) => k.loginId === l.id))
            .map((l) => ({ value: l.id, label: l.username ? `${l.name} (${l.username})` : l.name }))}
        />
      )}
    </div>
  );
}
