import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { canManagePipeline, canViewPipelineBoard, getErpAuth } from "@/lib/erpAuth";
import { loadDeals, loadJanitorialDeals } from "@/lib/erp/dealEdits";
import { loadStageRules, suggestedStep } from "@/lib/erp/dealStageRules";
import { fieldsFor } from "@/lib/erp/pipelineMissing";
import type { PipelineKey } from "@/lib/erp/postConDeals";
import { InfoTip } from "@/app/erp/components/ui";
import { StageRulesEditor } from "./StageRulesEditor";

export const metadata: Metadata = { title: "Stage rules" };
export const dynamic = "force-dynamic";

export default async function StageRulesPage({ searchParams }: { searchParams: Promise<{ pipeline?: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) redirect("/erp");
  const pipeline: PipelineKey = (await searchParams).pipeline === "janitorial" ? "janitorial" : "post-con";
  const bundle = pipeline === "janitorial" ? await loadJanitorialDeals() : await loadDeals();
  const rules = await loadStageRules(pipeline, bundle);
  const back = pipeline === "janitorial" ? "/erp/pipeline?pipeline=janitorial" : "/erp/pipeline";

  return (
    <div className="space-y-4">
      <Link href={back} className="text-xs text-pink-600 hover:underline">
        ← Deals
      </Link>
      <h1 className="flex items-center gap-1 text-2xl font-semibold text-gray-900">
        Stage rules
        <InfoTip text="What a deal needs before it can move forward into each stage from the Deals board. Moving it asks for anything missing first. The same rules decide the blue Missing flag on cards. Moves made in HubSpot itself can't be stopped, so those still show as Missing." />
      </h1>
      <div className="flex gap-2">
        {(["post-con", "janitorial"] as const).map((p) => (
          <Link
            key={p}
            href={p === "post-con" ? "/erp/pipeline/rules" : "/erp/pipeline/rules?pipeline=janitorial"}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${p === pipeline ? "bg-gray-200 text-gray-800" : "text-gray-500 hover:bg-gray-100"}`}
          >
            {p === "post-con" ? "Post-construction" : "Janitorial"}
          </Link>
        ))}
      </div>
      <StageRulesEditor
        key={pipeline}
        pipeline={pipeline}
        rules={rules}
        suggestions={Object.fromEntries(rules.map((r) => [r.stageId, suggestedStep(r.label, pipeline)]))}
        fields={fieldsFor(pipeline)}
        canEdit={canManagePipeline(auth.role)}
      />
    </div>
  );
}
