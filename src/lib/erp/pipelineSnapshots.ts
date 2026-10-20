/**
 * Daily pipeline snapshot (PIPELINE_PLAN Phase 8 groundwork): one row per
 * open deal per day, both pipelines, so the weekly summary and forecast can
 * compare weeks once they're built. Deals that closed show up as missing from
 * the next day's rows. Rows older than KEEP_DAYS are deleted. Runs from the
 * daily management-reminders cron; a second run the same day adds nothing.
 */
import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { loadDealBundle, loadJanitorialDealBundle, outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";

/** Two years (user decision 2026-10-19). */
const KEEP_DAYS = 730;

export type SnapshotRow = { day: string; pipeline: PipelineKey; hubspotDealId: string; stageId: string; cents: number; ownerId: string | null };

/** Today's rows, without saving them. */
export async function buildSnapshotRows(day: string = todayEasternKey(), preloaded?: { pipeline: PipelineKey; bundle: Bundle }[]): Promise<SnapshotRow[]> {
  const bundles = preloaded ?? [
    { pipeline: "post-con" as const, bundle: await loadDealBundle() },
    { pipeline: "janitorial" as const, bundle: await loadJanitorialDealBundle() },
  ];
  return bundles.flatMap(({ pipeline, bundle }) =>
    bundle.deals
      .filter((d) => outcomeOf(bundle, d.stageId) === "open")
      .map((d) => ({ day, pipeline, hubspotDealId: d.id, stageId: d.stageId, cents: d.cents, ownerId: d.ownerId })),
  );
}

export async function savePipelineSnapshot(day: string = todayEasternKey()): Promise<{ saved: number; deleted: number }> {
  const rows = await buildSnapshotRows(day);
  const { count: saved } = await prisma.pipelineSnapshot.createMany({ data: rows, skipDuplicates: true });
  const { count: deleted } = await prisma.pipelineSnapshot.deleteMany({ where: { day: { lt: addDaysKey(day, -KEEP_DAYS) } } });
  return { saved, deleted };
}
