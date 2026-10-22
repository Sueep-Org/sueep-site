import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getErpAuth, canEditCompanies, canViewPipelineBoard } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { CLOSED_DAYS, loadPipelineBoard, type PipelineBoard } from "@/lib/erp/pipelineBoard";
import { WORK_SCOPES, WORK_SCOPE_LABELS, type PipelineKey } from "@/lib/erp/postConDeals";
import { loadLostReasonOptions, type LostReasonOption } from "@/lib/erp/dealLostReasons";
import { loadTypeOfBusinessOptions } from "@/lib/erp/dealCreate";
import { prisma } from "@/lib/prisma";
import { PipelineBoardView } from "./PipelineBoardView";

export const metadata: Metadata = { title: "Deals" };
export const dynamic = "force-dynamic";

const PIPELINES: { key: PipelineKey; label: string }[] = [
  { key: "post-con", label: "Post-construction" },
  { key: "janitorial", label: "Janitorial" },
];

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ closed?: string; pipeline?: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) redirect("/erp");
  const params = await searchParams;
  const closed = params.closed === "all" ? "all" : "recent";
  const pipeline: PipelineKey = params.pipeline === "janitorial" ? "janitorial" : "post-con";

  let board: PipelineBoard | null = null;
  let reasonOptions: LostReasonOption[] = [];
  let error: string | null = null;
  const [companies, typeOptions] = await Promise.all([
    prisma.clientCompany.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadTypeOfBusinessOptions().catch(() => []),
  ]);
  try {
    [board, reasonOptions] = await Promise.all([loadPipelineBoard(pipeline, closed, auth.email), loadLostReasonOptions()]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
        Deals
        <InfoTip text="HubSpot deals by stage, like HubSpot's board. New deals, stage moves and edits made here save to HubSpot. Changes made in HubSpot show within a couple of minutes." />
      </h1>
      <div className="flex flex-wrap gap-2">
        {PIPELINES.map((p) => (
          <Link
            key={p.key}
            href={p.key === "post-con" ? "/erp/pipeline" : `/erp/pipeline?pipeline=${p.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              p.key === pipeline ? "bg-gray-200 text-gray-800" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>
      {error || !board ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Couldn&apos;t read HubSpot: {error}</p>
      ) : (
        <>
          <PipelineBoardView
            key={pipeline}
            board={board}
            closedDays={CLOSED_DAYS}
            reasonOptions={reasonOptions}
            mayEditCompanies={canEditCompanies(auth.role)}
            typeOptions={typeOptions}
            companies={companies.map((c) => ({ value: c.id, label: c.name }))}
            startOnMine={auth.role === "SALES" || auth.role === "ESTIMATION"}
            scopes={WORK_SCOPES.map((k) => ({ value: k, label: WORK_SCOPE_LABELS[k] }))}
          />
          <p className="text-xs text-gray-400">From HubSpot as of {new Date(board.fetchedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}.</p>
        </>
      )}
    </div>
  );
}
