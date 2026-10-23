/**
 * Following deals on the Deals board (PIPELINE_EXTRAS_PLAN Phase 7). The
 * hourly cron compares each followed deal's stage and owner with the last
 * ones alerted on (DealFollowSnapshot) and emails followers what changed:
 * a new stage, won, lost, or a new owner. Changes made on the board are
 * logged with who made them (DealInfoChange, DealLostChange), so that person
 * isn't alerted and the email can say who it was; anything else happened in
 * HubSpot. One email per follower per run, listing every deal that changed.
 */
import { prisma } from "@/lib/prisma";
import { buildDealFollowEmail, sendEmail } from "@/lib/email";
import { loadDeals, loadJanitorialDeals } from "./dealEdits";
import { outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL?.trim() || "";

/** The board, opened on this deal's panel. */
export function boardDealUrl(pipeline: PipelineKey, dealId: string) {
  return `${appUrl()}/erp/pipeline?${pipeline === "janitorial" ? "pipeline=janitorial&" : ""}deal=${dealId}`;
}

export async function followedDealIds(userEmail: string, pipeline: PipelineKey): Promise<string[]> {
  const rows = await prisma.dealFollower.findMany({ where: { userEmail, pipeline }, select: { hubspotDealId: true } }).catch(() => []);
  return rows.map((r) => r.hubspotDealId);
}

/** Follow or stop following. Following records the deal as it is now, so only later changes alert. */
export async function setFollowing(input: { dealId: string; pipeline: PipelineKey; userEmail: string; follow: boolean }) {
  if (!input.follow) {
    await prisma.dealFollower.deleteMany({ where: { hubspotDealId: input.dealId, userEmail: input.userEmail } });
    return { following: false };
  }
  const bundle = input.pipeline === "janitorial" ? await loadJanitorialDeals() : await loadDeals();
  const deal = bundle.deals.find((d) => d.id === input.dealId);
  if (!deal) return { error: "That deal isn't on the board. Reload the page." };
  await prisma.dealFollower.upsert({
    where: { hubspotDealId_userEmail: { hubspotDealId: input.dealId, userEmail: input.userEmail } },
    create: { hubspotDealId: input.dealId, pipeline: input.pipeline, userEmail: input.userEmail },
    update: {},
  });
  // Someone else may already follow it; their snapshot is the one to keep.
  await prisma.dealFollowSnapshot.upsert({
    where: { hubspotDealId: input.dealId },
    create: { hubspotDealId: input.dealId, stageId: deal.stageId, ownerId: deal.ownerId },
    update: {},
  });
  return { following: true };
}

export type FollowAlert = { to: string; pipeline: PipelineKey; dealId: string; dealName: string; changes: string[] };

async function alertsFor(pipeline: PipelineKey, bundle: Bundle) {
  const followers = await prisma.dealFollower.findMany({ where: { pipeline } });
  if (!followers.length) return { alerts: [] as FollowAlert[], snapshots: [] as { id: string; stageId: string; ownerId: string | null }[] };
  const ids = [...new Set(followers.map((f) => f.hubspotDealId))];
  const [snaps, info, lost] = await Promise.all([
    prisma.dealFollowSnapshot.findMany({ where: { hubspotDealId: { in: ids } } }),
    prisma.dealInfoChange.findMany({ where: { hubspotDealId: { in: ids }, property: { in: ["dealstage", "hubspot_owner_id"] } }, orderBy: { createdAt: "desc" } }),
    prisma.dealLostChange.findMany({ where: { hubspotDealId: { in: ids }, action: "MARK_LOST" }, orderBy: { createdAt: "desc" } }),
  ]);
  const snapOf = new Map(snaps.map((s) => [s.hubspotDealId, s]));
  const stage = (id: string) => (bundle.stageLabels[id] ?? id).trim();
  const owner = (id: string | null) => (id ? (bundle.owners[id] ?? "someone") : "no one");

  const alerts: FollowAlert[] = [];
  const snapshots: { id: string; stageId: string; ownerId: string | null }[] = [];
  for (const id of ids) {
    const d = bundle.deals.find((x) => x.id === id);
    const snap = snapOf.get(id);
    if (!d || !snap) continue;
    const since = snap.updatedAt;
    const changes: { text: string; by: string | null }[] = [];
    if (d.stageId !== snap.stageId) {
      // Who moved it, if it was moved from the board after the last alert.
      const by =
        info.find((c) => c.hubspotDealId === id && c.property === "dealstage" && c.toValue === d.stageId && c.createdAt > since)?.byEmail ??
        lost.find((c) => c.hubspotDealId === id && c.toStageId === d.stageId && c.createdAt > since)?.byEmail ??
        null;
      const o = outcomeOf(bundle, d.stageId);
      const what = o === "won" ? `Won (${stage(d.stageId)})` : o === "lost" ? `Lost${d.lostReason ? `: ${d.lostReason.split(";").join(", ")}` : ""}` : `Moved from ${stage(snap.stageId)} to ${stage(d.stageId)}`;
      changes.push({ text: `${what}${by ? `, by ${by}` : ", in HubSpot"}`, by });
    }
    if ((d.ownerId ?? null) !== (snap.ownerId ?? null)) {
      const by = info.find((c) => c.hubspotDealId === id && c.property === "hubspot_owner_id" && c.toValue === (d.ownerId ?? "") && c.createdAt > since)?.byEmail ?? null;
      changes.push({ text: `Owner changed from ${owner(snap.ownerId)} to ${owner(d.ownerId)}${by ? `, by ${by}` : ", in HubSpot"}`, by });
    }
    if (!changes.length) continue;
    snapshots.push({ id, stageId: d.stageId, ownerId: d.ownerId });
    for (const f of followers.filter((x) => x.hubspotDealId === id)) {
      const mine = changes.filter((c) => c.by?.toLowerCase() !== f.userEmail.toLowerCase()).map((c) => c.text);
      if (mine.length) alerts.push({ to: f.userEmail, pipeline, dealId: id, dealName: d.name, changes: mine });
    }
  }
  return { alerts, snapshots };
}

/** Both pipelines. `apply: false` only reports what it would send. `bundles` skips the cache, for checks run outside the app. */
export async function runFollowAlerts({ apply, bundles }: { apply: boolean; bundles?: { post: Bundle; jan: Bundle } }): Promise<FollowAlert[]> {
  const [post, jan] = bundles ? [bundles.post, bundles.jan] : await Promise.all([loadDeals(), loadJanitorialDeals()]);
  const results = [await alertsFor("post-con", post), await alertsFor("janitorial", jan)];
  const alerts = results.flatMap((r) => r.alerts);
  if (!apply) return alerts;

  // Snapshots first: if an email fails, that change isn't sent again every hour.
  for (const s of results.flatMap((r) => r.snapshots)) {
    await prisma.dealFollowSnapshot.update({ where: { hubspotDealId: s.id }, data: { stageId: s.stageId, ownerId: s.ownerId } });
  }
  const byPerson = new Map<string, FollowAlert[]>();
  for (const a of alerts) byPerson.set(a.to, [...(byPerson.get(a.to) ?? []), a]);
  const sent = await Promise.allSettled(
    [...byPerson].map(([to, list]) =>
      sendEmail({
        type: "DEAL_FOLLOW",
        to,
        link: list.length === 1 ? `/erp/pipeline?${list[0].pipeline === "janitorial" ? "pipeline=janitorial&" : ""}deal=${list[0].dealId}` : "/erp/pipeline",
        subject: list.length === 1 ? `Deal update: ${list[0].dealName}` : `${list.length} deals you follow changed`,
        html: buildDealFollowEmail({ deals: list.map((a) => ({ name: a.dealName, url: boardDealUrl(a.pipeline, a.dealId), changes: a.changes })) }),
      }),
    ),
  );
  const failed = sent.filter((r) => r.status === "rejected").length;
  if (failed) console.error(`deal follow alerts: ${failed} email(s) failed`);
  return alerts;
}
