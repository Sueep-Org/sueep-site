import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManagePipeline, getErpAuth } from "@/lib/erpAuth";
import { loadDeals, loadJanitorialDeals } from "@/lib/erp/dealEdits";
import { outcomeOf } from "@/lib/erp/postConDeals";
import { fieldsFor, type MissingField } from "@/lib/erp/pipelineMissing";

export const runtime = "nodejs";

async function manager() {
  const auth = await getErpAuth();
  if (!auth || !canManagePipeline(auth.role)) return { auth: null, error: NextResponse.json({ error: "Only Admins and the Business Manager can change stage rules" }, { status: 403 }) };
  return { auth, error: null };
}

/** PUT { pipeline, rules: [{ stageId, required, nextStep: { text, days, onBidDate } | null }] }: saves every open stage. */
export async function PUT(req: Request) {
  const { auth, error } = await manager();
  if (error) return error;
  const body = (await req.json().catch(() => null)) as { pipeline?: unknown; rules?: unknown } | null;
  if (!body || !Array.isArray(body.rules)) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const pipeline = body.pipeline === "janitorial" ? "janitorial" : "post-con";
  const bundle = pipeline === "janitorial" ? await loadJanitorialDeals() : await loadDeals();
  const open = new Set(bundle.stageOrder.filter((id) => outcomeOf(bundle, id) === "open"));
  const allowed = new Set(fieldsFor(pipeline));

  const rows = (body.rules as { stageId?: unknown; required?: unknown; nextStep?: unknown }[])
    .filter((r) => typeof r.stageId === "string" && open.has(r.stageId))
    .map((r) => {
      const step = (r.nextStep && typeof r.nextStep === "object" ? r.nextStep : {}) as { text?: unknown; days?: unknown; onBidDate?: unknown };
      const text = typeof step.text === "string" ? step.text.trim().slice(0, 200) : "";
      const days = Number(step.days);
      return {
        stageId: r.stageId as string,
        requiredFields: [...new Set((Array.isArray(r.required) ? r.required : []).filter((f): f is MissingField => typeof f === "string" && allowed.has(f as MissingField)))],
        nextStepText: text || null,
        nextStepDays: text ? (Number.isInteger(days) && days >= 0 && days <= 365 ? days : 3) : null,
        nextStepBidDate: !!text && pipeline === "post-con" && step.onBidDate === true,
      };
    });
  await prisma.$transaction(
    rows.map((r) =>
      prisma.dealStageRule.upsert({
        where: { pipeline_stageId: { pipeline, stageId: r.stageId } },
        create: { pipeline, ...r, updatedBy: auth.email },
        update: { requiredFields: r.requiredFields, nextStepText: r.nextStepText, nextStepDays: r.nextStepDays, nextStepBidDate: r.nextStepBidDate, updatedBy: auth.email },
      }),
    ),
  );
  return NextResponse.json({ saved: rows.length });
}

/** DELETE ?pipeline=: back to the defaults for every stage. */
export async function DELETE(req: Request) {
  const { error } = await manager();
  if (error) return error;
  const pipeline = new URL(req.url).searchParams.get("pipeline") === "janitorial" ? "janitorial" : "post-con";
  await prisma.dealStageRule.deleteMany({ where: { pipeline } });
  return NextResponse.json({ ok: true });
}
