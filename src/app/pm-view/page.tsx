import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Turnover Status | Sueep",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "In progress",
  UPCOMING: "Upcoming",
  ON_HOLD: "On hold",
  COMPLETE: "Complete",
  ARCHIVED: "Archived",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-blue-50 text-blue-700 ring-blue-200",
  UPCOMING: "bg-amber-50 text-amber-700 ring-amber-200",
  ON_HOLD: "bg-gray-100 text-gray-600 ring-gray-200",
  COMPLETE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ARCHIVED: "bg-gray-100 text-gray-500 ring-gray-200",
};

function getDescLine(description: string | null, key: string): string {
  if (!description) return "";
  const prefix = `${key}:`;
  return (
    description
      .split(/\r?\n/)
      .find((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()))
      ?.replace(new RegExp(`^${key}:\\s*`, "i"), "")
      .trim() ?? ""
  );
}

function ServiceBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-pink-50 px-2.5 py-0.5 text-xs font-medium text-pink-700 ring-1 ring-inset ring-pink-200">
      {label}
    </span>
  );
}

type PageProps = { searchParams: Promise<{ building?: string }> };

export default async function PmViewPage({ searchParams }: PageProps) {
  const { building: buildingId } = await searchParams;
  if (!buildingId) notFound();

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    select: { id: true, name: true, address: true, pmName: true, pmEmail: true, pmPhone: true },
  });
  if (!building) notFound();

  const projects = await prisma.project.findMany({
    where: {
      buildingId,
      segment: "JANITORIAL_TURNOVER_REQUESTS",
      status: { notIn: ["COMPLETE", "ARCHIVED"] },
    },
    orderBy: [{ projectDate: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      jobTitle: true,
      description: true,
      status: true,
      projectDate: true,
      projectEndDate: true,
      supervisor: true,
      contractValueCents: true,
      createdAt: true,
      turnoverRequest: {
        select: {
          priceCents: true,
          fullClean: true,
          fullPaint: true,
          touchUpPaint: true,
          carpetCleaning: true,
          materialsAdditional: true,
          bedrooms: true,
          bathrooms: true,
          unitNumber: true,
        },
      },
    },
  });

  const formatDate = (d: Date | null) =>
    d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900">
      <div className="mx-auto w-full max-w-3xl space-y-8">

        {/* Header */}
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">Sueep</p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-950">{building.name}</h1>
          {building.address && (
            <p className="mt-1 text-sm text-gray-500">{building.address}</p>
          )}
        </div>

        {/* Building contact info */}
        {(building.pmName || building.pmEmail || building.pmPhone) && (
          <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Property contact</p>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
              {building.pmName && <span className="font-medium">{building.pmName}</span>}
              {building.pmEmail && <a href={`mailto:${building.pmEmail}`} className="text-pink-600 hover:underline">{building.pmEmail}</a>}
              {building.pmPhone && <span>{building.pmPhone}</span>}
            </div>
          </div>
        )}

        {/* Project list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Active turnover requests
            </h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
              {projects.length}
            </span>
          </div>

          {projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
              <p className="text-sm text-gray-500">No active turnover requests for this building.</p>
              <p className="mt-1 text-xs text-gray-400">New submissions will appear here.</p>
            </div>
          ) : (
            projects.map((project) => {
              const units = getDescLine(project.description, "Units") || getDescLine(project.description, "Unit Numbers") || project.turnoverRequest?.unitNumber || "";
              const sueepPm = project.supervisor || getDescLine(project.description, "SUEEP PM");

              // Price — prefer TurnoverRequest.priceCents, fall back to contractValueCents
              const priceCents = project.turnoverRequest?.priceCents ?? project.contractValueCents ?? null;
              const priceLabel = priceCents != null && priceCents > 0
                ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(priceCents / 100)
                : null;

              // Price package rates from description (stored on new submissions)
              const pricePackage = getDescLine(project.description, "Price Package");

              // Services — read from TurnoverRequest flags; fall back to description keywords
              const tr = project.turnoverRequest;
              const services: string[] = tr ? [
                tr.fullClean ? "Full clean" : null,
                tr.fullPaint ? "Full paint" : null,
                tr.touchUpPaint ? "Touch-up paint" : null,
                tr.carpetCleaning ? "Carpet cleaning" : null,
                tr.materialsAdditional ? "Additional materials" : null,
              ].filter((s): s is string => Boolean(s)) : [];

              const statusKey = project.status ?? "ACTIVE";
              const statusLabel = STATUS_LABEL[statusKey] ?? statusKey;
              const statusColor = STATUS_COLOR[statusKey] ?? "bg-gray-100 text-gray-600 ring-gray-200";

              return (
                <div key={project.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{project.jobTitle}</p>
                      {units && (
                        <p className="mt-0.5 text-sm text-gray-500">Units: {units}</p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusColor}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Dates */}
                  {(project.projectDate || project.projectEndDate) && (
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                      {project.projectDate && (
                        <span>Start: <strong className="text-gray-700">{formatDate(project.projectDate)}</strong></span>
                      )}
                      {project.projectEndDate && (
                        <span>End: <strong className="text-gray-700">{formatDate(project.projectEndDate)}</strong></span>
                      )}
                    </div>
                  )}

                  {/* Services */}
                  {services.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {services.map((s) => <ServiceBadge key={s} label={s} />)}
                    </div>
                  )}

                  {/* Pricing */}
                  {(priceLabel || pricePackage) && (
                    <div className="mt-3 overflow-hidden rounded-md border border-gray-200 bg-white">
                      {/* Unit total */}
                      {priceLabel && (
                        <div className="flex items-baseline justify-between bg-pink-50 px-4 py-3">
                          <span className="text-sm font-semibold text-pink-700">Estimated total</span>
                          <span className="text-xl font-bold text-pink-700">{priceLabel}</span>
                        </div>
                      )}
                      {/* Price package rates */}
                      {pricePackage && (
                        <div className="px-4 py-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pricing package rates</p>
                          <ul className="space-y-1.5">
                            {pricePackage.split(" | ").map((rate) => {
                              const lastSpace = rate.lastIndexOf(" ");
                              const name = rate.slice(0, lastSpace).trim();
                              const price = rate.slice(lastSpace + 1).trim();
                              return (
                                <li key={rate} className="flex justify-between text-xs">
                                  <span className="text-gray-600">{name}</span>
                                  <span className="font-medium text-gray-800">{price}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sueep PM */}
                  {sueepPm && (
                    <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
                      Sueep PM: <span className="font-medium text-gray-700">{sueepPm}</span>
                    </div>
                  )}

                  <p className="mt-2 text-[10px] text-gray-400">
                    Submitted {formatDate(project.createdAt)}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <footer className="border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
          Questions? Contact your Sueep PM directly. This page is view-only.
        </footer>
      </div>
    </main>
  );
}
