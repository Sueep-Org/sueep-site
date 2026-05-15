import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CandidateApplicationEditor } from "./CandidateApplicationEditor";
import { CandidateQuestionnairePanel } from "./CandidateQuestionnairePanel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const row = await prisma.candidateApplication.findUnique({ where: { id } });
  if (!row) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";

  const responsesPretty =
    row.responses != null ? JSON.stringify(row.responses, null, 2) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/erp/candidates" className="text-zinc-500 hover:text-white">
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

      <CandidateQuestionnairePanel
        id={row.id}
        email={row.email}
        questionnaireToken={row.questionnaireToken}
        questionnaireSentAt={row.questionnaireSentAt ? row.questionnaireSentAt.toISOString() : null}
        questionnaireCompletedAt={row.questionnaireCompletedAt ? row.questionnaireCompletedAt.toISOString() : null}
        googleFormConfigured={Boolean(process.env.QUESTIONNAIRE_GOOGLE_FORM_URL?.trim())}
        resendConfigured={Boolean(process.env.RESEND_API_KEY)}
        webhookConfigured={Boolean(process.env.CANDIDATE_QUESTIONNAIRE_WEBHOOK_SECRET?.trim())}
        siteUrl={siteUrl}
      />

      <CandidateApplicationEditor initial={{ id: row.id, status: row.status, internalNotes: row.internalNotes }} />

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Submission</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Email</dt>
            <dd className="mt-0.5 text-white">
              <a href={`mailto:${row.email}`} className="text-[#E73C6E] hover:underline">
                {row.email}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Phone</dt>
            <dd className="mt-0.5 text-white">{row.phone || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Work interest</dt>
            <dd className="mt-0.5 text-zinc-200 whitespace-pre-wrap">{row.positionInterest || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Applicant notes</dt>
            <dd className="mt-0.5 text-zinc-200 whitespace-pre-wrap">{row.additionalNotes || "—"}</dd>
          </div>
        </dl>
        {responsesPretty && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2">
              Extra responses (structured)
            </h3>
            <pre className="max-h-64 overflow-auto rounded-md bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-300 font-mono">
              {responsesPretty}
            </pre>
          </div>
        )}
        <p className="text-xs text-zinc-600 font-mono">id: {row.id}</p>
      </div>
    </div>
  );
}