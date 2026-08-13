import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CandidateApplicationEditor } from "./CandidateApplicationEditor";
import { CandidatePaperworkPanel } from "./CandidatePaperworkPanel";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { ContractSigningSection } from "@/app/erp/components/ContractSigningSection";
import { FinishOnboardingPanel } from "./FinishOnboardingPanel";
import { SubcontractorInfoSection } from "./SubcontractorInfoSection";
import { ConvertToContractorButton } from "./ConvertToContractorButton";
import { SUBCONTRACTOR_GATE_FIELD } from "@/lib/erp/subcontractorQuestionnaire";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const row = await prisma.candidateApplication.findUnique({
    where: { id },
    select: {
      id: true,
      createdAt: true,
      fullName: true,
      email: true,
      phone: true,
      positionInterest: true,
      additionalNotes: true,
      responses: true,
      status: true,
      internalNotes: true,
      paperwork: true,
      bankAccountRequired: true,
      paperworkUploadToken: true,
      paperworkUploadTokenExpiry: true,
      contracts: { orderBy: { createdAt: "asc" } },
      contractor: { select: { id: true } },
    },
  });
  if (!row) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";

  const responses = (row.responses ?? {}) as Record<string, string>;
  const location = responses.location;
  // Experience has been recorded three different ways over time:
  //  - Newest (applicants can check Cleaner and/or Painter): separate
  //    cleaningExperience/cleaningYears and paintingExperience/paintingYears,
  //    one pair per role actually checked.
  //  - Middle era (a single active-role toggle, no multi-select): generic
  //    experience/experienceYears meaning whichever single role
  //    positionInterest says was selected — has to be labeled using
  //    positionInterest, or a historical Painter's answer would misleadingly
  //    show up under "Cleaning experience".
  //  - Oldest (pre-role-choice, cleaning only): cleaningExperience/
  //    cleaningYears, already compatible with the newest shape's names.
  const hasNewShapeExperience = responses.cleaningExperience != null || responses.paintingExperience != null;
  let cleaningExperience: string | undefined;
  let cleaningExperienceYears: string | undefined;
  let paintingExperience: string | undefined;
  let paintingExperienceYears: string | undefined;
  if (hasNewShapeExperience) {
    cleaningExperience = responses.cleaningExperience;
    cleaningExperienceYears = responses.cleaningYears;
    paintingExperience = responses.paintingExperience;
    paintingExperienceYears = responses.paintingYears;
  } else if (row.positionInterest === "Painter") {
    paintingExperience = responses.experience;
    paintingExperienceYears = responses.experienceYears;
  } else {
    cleaningExperience = responses.experience;
    cleaningExperienceYears = responses.experienceYears;
  }
  const hasVehicle = responses.hasVehicle;
  // Only asked of Supervisor applicants (they oversee both cleaning and
  // painting crews), so these are undefined for Cleaner/Painter rows.
  const supervisingYears = responses.supervisingYears;
  const speaksEnglish = responses.speaksEnglish;
  const speaksSpanish = responses.speaksSpanish;
  const isSubcontractor = responses[SUBCONTRACTOR_GATE_FIELD] === "Yes";

  function formatExperience(exp: string | undefined, years: string | undefined): string {
    return exp === "yes"
      ? `Yes${years ? ` — ${years} yr${Number(years) !== 1 ? "s" : ""}` : ""}`
      : exp === "no"
      ? "No"
      : "—";
  }

  function formatYesNo(val: string | undefined): string {
    return val === "yes" ? "Yes" : val === "no" ? "No" : "—";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/erp/candidates" className="text-xs text-pink-600 hover:underline">
            ← Candidates
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">{row.fullName}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Applied{" "}
            {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(row.createdAt)}
          </p>
        </div>
        {isSubcontractor && (
          <ConvertToContractorButton applicationId={row.id} existingContractorId={row.contractor?.id ?? null} />
        )}
      </div>

      <DetailTabs tabs={[
        {
          label: "Pipeline",
          content: (
            <CandidateApplicationEditor
              initial={{
                id: row.id,
                status: row.status,
                internalNotes: row.internalNotes,
                paperwork: row.paperwork as { label: string; url: string }[] | null,
                bankAccountRequired: row.bankAccountRequired,
              }}
            />
          ),
        },
        {
          label: "Paperwork",
          content: (
            <CandidatePaperworkPanel
              id={row.id}
              email={row.email}
              status={row.status}
              paperwork={(row.paperwork ?? []) as { label: string; url: string }[]}
              paperworkUploadToken={row.paperworkUploadToken}
              paperworkUploadTokenExpiry={(row.paperworkUploadTokenExpiry as Date | null)?.toISOString() ?? null}
              resendConfigured={Boolean(process.env.RESEND_API_KEY)}
              siteUrl={siteUrl}
            />
          ),
        },
        {
          label: "Onboarding",
          content: (
            <FinishOnboardingPanel
              id={row.id}
              fullName={row.fullName}
              status={row.status}
              paperwork={(row.paperwork ?? []) as { label: string; url: string }[]}
            />
          ),
        },
        {
          label: "Submission",
          content: (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-pink-500">Email</dt>
                  <dd className="mt-0.5 text-pink-500">
                    <a href={`mailto:${row.email}`} className="text-[#E73C6E] hover:underline">
                      {row.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-pink-500">Phone</dt>
                  <dd className="mt-0.5 text-zinc-500">{row.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-pink-500">Location</dt>
                  <dd className="mt-0.5 text-zinc-500">{location || "—"}</dd>
                </div>
                <div>
                  <dt className="text-pink-500">Position interest</dt>
                  <dd className="mt-0.5 text-zinc-500">{row.positionInterest || "—"}</dd>
                </div>
                <div>
                  <dt className="text-pink-500">Has vehicle</dt>
                  <dd className="mt-0.5 text-zinc-500">
                    {hasVehicle === "yes" ? "Yes" : hasVehicle === "no" ? "No" : "—"}
                  </dd>
                </div>
                {cleaningExperience !== undefined && (
                  <div>
                    <dt className="text-pink-500">Cleaning experience</dt>
                    <dd className="mt-0.5 text-zinc-500">
                      {formatExperience(cleaningExperience, cleaningExperienceYears)}
                    </dd>
                  </div>
                )}
                {paintingExperience !== undefined && (
                  <div>
                    <dt className="text-pink-500">Painting experience</dt>
                    <dd className="mt-0.5 text-zinc-500">
                      {formatExperience(paintingExperience, paintingExperienceYears)}
                    </dd>
                  </div>
                )}
                {cleaningExperience === undefined && paintingExperience === undefined && (
                  <div>
                    <dt className="text-pink-500">Experience</dt>
                    <dd className="mt-0.5 text-zinc-500">—</dd>
                  </div>
                )}
                {supervisingYears !== undefined && (
                  <div>
                    <dt className="text-pink-500">Supervising experience</dt>
                    <dd className="mt-0.5 text-zinc-500">
                      {supervisingYears
                        ? `${supervisingYears} yr${Number(supervisingYears) !== 1 ? "s" : ""}`
                        : "—"}
                    </dd>
                  </div>
                )}
                {speaksEnglish !== undefined && (
                  <div>
                    <dt className="text-pink-500">Speaks English</dt>
                    <dd className="mt-0.5 text-zinc-500">{formatYesNo(speaksEnglish)}</dd>
                  </div>
                )}
                {speaksSpanish !== undefined && (
                  <div>
                    <dt className="text-pink-500">Speaks Spanish</dt>
                    <dd className="mt-0.5 text-zinc-500">{formatYesNo(speaksSpanish)}</dd>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <dt className="text-pink-500">Additional comments</dt>
                  <dd className="mt-0.5 text-zinc-500 whitespace-pre-wrap">{row.additionalNotes || "—"}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-zinc-600 font-mono">id: {row.id}</p>
            </>
          ),
        },
        ...(isSubcontractor
          ? [
              {
                label: "Subcontractor Info",
                content: <SubcontractorInfoSection responses={responses} />,
              },
            ]
          : []),
        {
          label: "Signing",
          content: (
            <ContractSigningSection
              apiBasePath={`/api/erp/candidates/${row.id}`}
              initialContracts={row.contracts.map((c) => ({
                id: c.id,
                contractPdfFilename: c.contractPdfFilename,
                docusealTemplateId: c.docusealTemplateId,
                signingStatus: c.signingStatus,
                signerEmail: c.signerEmail,
                signedAt: c.signedAt?.toISOString() ?? null,
                signedDocumentUrl: c.signedDocumentUrl,
              }))}
            />
          ),
        },
      ]} />
    </div>
  );
}
