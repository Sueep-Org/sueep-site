import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CandidateApplicationEditor } from "./CandidateApplicationEditor";
import { CandidatePaperworkPanel } from "./CandidatePaperworkPanel";
import { CollapsiblePanel } from "@/app/erp/components/CollapsiblePanel";
import { FinishOnboardingPanel } from "./FinishOnboardingPanel";

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
    },
  });
  if (!row) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";

  const responses = (row.responses ?? {}) as Record<string, string>;
  const cleaningExp = responses.cleaningExperience;
  const cleaningYears = responses.cleaningYears;
  const hasVehicle = responses.hasVehicle;

  const cleaningExpLabel =
    cleaningExp === "yes"
      ? `Yes${cleaningYears ? ` — ${cleaningYears} yr${Number(cleaningYears) !== 1 ? "s" : ""}` : ""}`
      : cleaningExp === "no"
      ? "No"
      : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/erp/candidates" className="text-zinc-500 hover:text-pink-500">
          ← Candidates
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-white">{row.fullName}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Applied{" "}
          {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short" }).format(row.createdAt)}
        </p>
      </div>

      <CollapsiblePanel title="Pipeline">
        <CandidateApplicationEditor
          initial={{
            id: row.id,
            status: row.status,
            internalNotes: row.internalNotes,
            paperwork: row.paperwork as { label: string; url: string }[] | null,
            bankAccountRequired: row.bankAccountRequired,
          }}
        />
      </CollapsiblePanel>

      <CollapsiblePanel title="Paperwork upload link" defaultOpen={row.status === "ONBOARDING"}>
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
      </CollapsiblePanel>

      <FinishOnboardingPanel
        id={row.id}
        fullName={row.fullName}
        status={row.status}
        paperwork={(row.paperwork ?? []) as { label: string; url: string }[]}
      />

      <CollapsiblePanel title="Submission" defaultOpen={false}>
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
            <dt className="text-pink-500">Position interest</dt>
            <dd className="mt-0.5 text-zinc-500">{row.positionInterest || "—"}</dd>
          </div>
          <div>
            <dt className="text-pink-500">Has vehicle</dt>
            <dd className="mt-0.5 text-zinc-500">
              {hasVehicle === "yes" ? "Yes" : hasVehicle === "no" ? "No" : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-pink-500">Cleaning experience</dt>
            <dd className="mt-0.5 text-zinc-500">{cleaningExpLabel}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-pink-500">Additional comments</dt>
            <dd className="mt-0.5 text-zinc-500 whitespace-pre-wrap">{row.additionalNotes || "—"}</dd>
          </div>
        </dl>
        <p className="text-xs text-zinc-600 font-mono">id: {row.id}</p>
      </CollapsiblePanel>
    </div>
  );
}
