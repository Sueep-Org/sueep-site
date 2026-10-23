import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canSeeOfficeHiring, getErpAuth } from "@/lib/erpAuth";
import { formatSalaryRange, officeStageMeta, openingStatusMeta, workModeLabel } from "@/lib/erp/officeHiring";
import { isoToday, offerFlag } from "@/lib/erp/offerLetters";
import { DeleteOpeningButton, EditOpeningButton } from "../../office/OpeningFormModal";
import { AddOfficeCandidateButton } from "../../office/OfficeCandidateControls";
import { OpeningCandidatesView } from "../../office/OpeningCandidatesView";
import { PostingsSection } from "../../office/PostingsSection";
import { daysOpen, loadHiringManagers } from "../../office/OfficeTab";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function JobOpeningPage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canSeeOfficeHiring(auth.role)) notFound();
  const { id } = await params;

  const [opening, managers] = await Promise.all([
    prisma.jobOpening.findUnique({
      where: { id },
      include: {
        postings: { orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }] },
        candidates: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            responses: true,
            expectedSalary: true,
            stage: true,
            shortlisted: true,
            source: true,
            createdAt: true,
            offerLetters: {
              where: { status: { not: "VOID" } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { status: true, sentAt: true, signByDate: true },
            },
          },
        },
      },
    }),
    loadHiringManagers(),
  ]);
  if (!opening) notFound();

  const status = openingStatusMeta(opening.status);
  const today = isoToday();
  const salary = formatSalaryRange(opening.salaryMinCents, opening.salaryMaxCents);
  const meta = [opening.department, opening.location, workModeLabel(opening.workMode), salary].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/erp/candidates?track=office" className="text-xs text-pink-600 hover:underline">
            ← Office openings
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-gray-900">
            {opening.title}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.cls}`}>{status.label}</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {[...meta, `${daysOpen(opening.openedAt, opening.closedAt)} days open`, opening.hiringManagerEmail ? `Hiring manager: ${opening.hiringManagerEmail}` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {opening.description ? (
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-gray-600">{opening.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {opening.candidates.length === 0 ? <DeleteOpeningButton id={opening.id} /> : null}
          <EditOpeningButton
            managers={managers}
            opening={{
              id: opening.id,
              title: opening.title,
              department: opening.department,
              location: opening.location,
              workMode: opening.workMode,
              salaryMinCents: opening.salaryMinCents,
              salaryMaxCents: opening.salaryMaxCents,
              status: opening.status,
              hiringManagerEmail: opening.hiringManagerEmail,
              description: opening.description,
            }}
          />
          <AddOfficeCandidateButton openingId={opening.id} />
        </div>
      </div>

      <PostingsSection
        openingId={opening.id}
        postings={opening.postings.map((p) => ({
          id: p.id,
          source: p.source,
          costCents: p.costCents,
          applicantCount: p.applicantCount,
          postedAt: p.postedAt?.toISOString() ?? null,
          notes: p.notes,
        }))}
      />

      <OpeningCandidatesView
        initial={opening.candidates.map((c) => {
          const location = (c.responses as Record<string, unknown> | null)?.location;
          return {
            id: c.id,
            fullName: c.fullName,
            phone: c.phone,
            email: c.email,
            location: typeof location === "string" && location ? location : null,
            expectedSalary: c.expectedSalary,
            stage: officeStageMeta(c.stage).value,
            shortlisted: c.shortlisted,
            source: c.source,
            createdAt: c.createdAt.toISOString(),
            offer: offerFlag(
              c.offerLetters[0]
                ? {
                    status: c.offerLetters[0].status,
                    sentAt: c.offerLetters[0].sentAt?.toISOString() ?? null,
                    signByDate: c.offerLetters[0].signByDate?.toISOString() ?? null,
                  }
                : null,
              today,
            ),
          };
        })}
      />
    </div>
  );
}
