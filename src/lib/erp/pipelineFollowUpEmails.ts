/**
 * Monday pipeline follow-up emails (PIPELINE_PLAN Phase 3), run from the
 * daily management-reminders cron on Mondays.
 *
 * - Owner email: each HubSpot deal owner with an ERP login (same email) gets
 *   their open deals with an overdue next step, one due this week, and ones
 *   in a stage that needs a next step but has none (biggest first, capped).
 * - Summary: every Admin gets the counts per owner, including owners no
 *   longer active in HubSpot, and every overdue next step.
 * - Both pipelines. Nothing is sent when a list is empty.
 */
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { todayEasternKey } from "./dates";
import { addDaysKey } from "./manualHoursRepeat";
import { centsToDollarsCompact } from "./money";
import { dealUrl, loadDealBundle, loadJanitorialDealBundle, outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";
import { nextStepStages, openNextSteps, type NextStep } from "./dealFollowUps";
import { loadWinBands, type WinBand } from "./winChance";

/** Most rows per list in one email; the rest are on the board. */
const MAX_ROWS = 15;

type Item = {
  dealId: string;
  name: string;
  cents: number;
  stage: string;
  pipeline: PipelineKey;
  url: string | null;
  step: NextStep | null;
  ownerId: string | null;
  /** Chance to win, post-construction only */
  band: WinBand | null;
};
type OwnerList = { ownerId: string | null; owner: string; email: string | null; overdue: Item[]; week: Item[]; none: Item[] };

export type FollowUpEmail = { type: "PIPELINE_FOLLOW_UPS" | "PIPELINE_FOLLOW_UPS_SUMMARY"; to: string[]; subject: string; html: string };

function dayLabel(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Every open deal in a next-step stage, or with an open next step, per owner. */
async function collect(todayKey: string, bundles: { pipeline: PipelineKey; bundle: Bundle }[]): Promise<OwnerList[]> {
  const steps = await openNextSteps();
  const weekEnd = addDaysKey(todayKey, 6);
  const byOwner = new Map<string, OwnerList>();
  for (const { pipeline, bundle } of bundles) {
    const expected = nextStepStages(bundle);
    const bandOf = pipeline === "post-con" ? await loadWinBands(bundle) : () => null;
    for (const d of bundle.deals) {
      if (outcomeOf(bundle, d.stageId) !== "open") continue;
      const step = steps.get(d.id) ?? null;
      if (!step && !expected.has(d.stageId)) continue;
      const key = d.ownerId ?? "-";
      const list = byOwner.get(key) ?? {
        ownerId: d.ownerId,
        owner: d.ownerId ? (bundle.owners[d.ownerId] ?? "Unknown owner") : "No owner",
        email: d.ownerId ? (bundle.ownerEmails[d.ownerId] ?? null) : null,
        overdue: [],
        week: [],
        none: [],
      };
      const item: Item = {
        dealId: d.id,
        name: d.name,
        cents: d.cents,
        stage: (bundle.stageLabels[d.stageId] ?? "").trim(),
        pipeline,
        url: dealUrl(bundle.hubId, d.id),
        step,
        ownerId: d.ownerId,
        band: bandOf(d),
      };
      if (!step) list.none.push(item);
      else if (step.dueDate < todayKey) list.overdue.push(item);
      else if (step.dueDate <= weekEnd) list.week.push(item);
      byOwner.set(key, list);
    }
  }
  for (const l of byOwner.values()) {
    l.overdue.sort((a, b) => a.step!.dueDate.localeCompare(b.step!.dueDate));
    l.week.sort((a, b) => a.step!.dueDate.localeCompare(b.step!.dueDate));
    l.none.sort((a, b) => b.cents - a.cents);
  }
  return [...byOwner.values()].sort((a, b) => a.owner.localeCompare(b.owner));
}

function itemLine(i: Item, withOwner?: string): string {
  const name = i.url ? `<a href="${escapeHtml(i.url)}">${escapeHtml(i.name)}</a>` : escapeHtml(i.name);
  const bits = [
    i.band ? `${i.band} chance` : null,
    i.stage,
    i.cents ? centsToDollarsCompact(i.cents) : null,
    i.pipeline === "janitorial" ? "Janitorial" : null,
    withOwner ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
  const step = i.step ? `<br><span style="color:#6b7280">${escapeHtml(i.step.text)}, due ${escapeHtml(dayLabel(i.step.dueDate))}</span>` : "";
  return `<li>${name} <span style="color:#6b7280">(${escapeHtml(bits)})</span>${step}</li>`;
}

function section(title: string, items: Item[], boardUrl: string, more: string, withOwner?: (i: Item) => string): string {
  if (!items.length) return "";
  const rows = items
    .slice(0, MAX_ROWS)
    .map((i) => itemLine(i, withOwner?.(i)))
    .join("");
  const rest =
    items.length > MAX_ROWS
      ? `<p style="color:#6b7280">And ${items.length - MAX_ROWS} more. <a href="${escapeHtml(boardUrl)}">${escapeHtml(more)}</a></p>`
      : "";
  return `<h3 style="margin:16px 0 4px">${escapeHtml(title)} (${items.length})</h3><ul>${rows}</ul>${rest}`;
}

/** Builds the Monday emails without sending them. */
export async function buildFollowUpEmails(
  todayKey: string = todayEasternKey(),
  preloaded?: { pipeline: PipelineKey; bundle: Bundle }[],
): Promise<FollowUpEmail[]> {
  const bundles = preloaded ?? [
    { pipeline: "post-con" as const, bundle: await loadDealBundle() },
    { pipeline: "janitorial" as const, bundle: await loadJanitorialDealBundle() },
  ];
  const lists = await collect(todayKey, bundles);
  const users = await prisma.erpUser.findMany({ select: { email: true, role: true } });
  const loginEmails = new Set(users.map((u) => u.email.toLowerCase()));
  const admins = users.filter((u) => u.role === "ADMIN").map((u) => u.email);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const board = `${appUrl}/erp/pipeline`;
  const out: FollowUpEmail[] = [];

  for (const l of lists) {
    if (!l.email || !loginEmails.has(l.email)) continue;
    if (!l.overdue.length && !l.week.length && !l.none.length) continue;
    const html = [
      `<p>Your pipeline for the week. Open the <a href="${escapeHtml(board)}">Pipeline</a> board to update next steps.</p>`,
      section("Overdue", l.overdue, board, "See them on the board (Only show > Overdue next step)."),
      section("Due this week", l.week, board, "See them on the board."),
      section("No next step yet", l.none, board, "See them on the board (Only show > No next step)."),
    ].join("");
    const counts = [
      l.overdue.length && `${l.overdue.length} overdue`,
      l.week.length && `${l.week.length} due this week`,
      l.none.length && `${l.none.length} with no next step`,
    ]
      .filter(Boolean)
      .join(", ");
    out.push({ type: "PIPELINE_FOLLOW_UPS", to: [l.email], subject: `Pipeline this week: ${counts}`, html });
  }

  if (admins.length) {
    const active = (l: OwnerList) => !!l.email && loginEmails.has(l.email);
    const rows = lists
      .filter((l) => l.overdue.length || l.week.length || l.none.length)
      .map(
        (l) =>
          `<tr><td style="padding:2px 12px 2px 0">${escapeHtml(l.owner)}${active(l) ? "" : ' <span style="color:#9ca3af">(no ERP login)</span>'}</td><td style="padding:2px 12px;text-align:right">${l.overdue.length}</td><td style="padding:2px 12px;text-align:right">${l.week.length}</td><td style="padding:2px 0 2px 12px;text-align:right">${l.none.length}</td></tr>`,
      )
      .join("");
    const overdue = lists.flatMap((l) => l.overdue.map((i) => ({ i, owner: l.owner }))).sort((a, b) => a.i.step!.dueDate.localeCompare(b.i.step!.dueDate));
    if (rows) {
      const ownerOf = new Map(overdue.map((x) => [x.i.dealId, x.owner]));
      const html = [
        `<p>Next steps across the <a href="${escapeHtml(board)}">Pipeline</a> board, both pipelines. Owners without an ERP login don't get their own email, so their deals need a new owner in HubSpot or someone to pick them up.</p>`,
        `<table style="border-collapse:collapse;font-size:14px"><tr><th style="text-align:left;padding:2px 12px 2px 0">Owner</th><th style="padding:2px 12px">Overdue</th><th style="padding:2px 12px">Due this week</th><th style="padding:2px 0 2px 12px">No next step</th></tr>${rows}</table>`,
        section(
          "Overdue",
          overdue.map((x) => x.i),
          board,
          "See them on the board (Only show > Overdue next step).",
          (i) => ownerOf.get(i.dealId) ?? "",
        ),
      ].join("");
      const total = (k: "overdue" | "week" | "none") => lists.reduce((s, l) => s + l[k].length, 0);
      out.push({
        type: "PIPELINE_FOLLOW_UPS_SUMMARY",
        to: admins,
        subject: `Pipeline follow-ups: ${total("overdue")} overdue, ${total("week")} due this week, ${total("none")} with no next step`,
        html,
      });
    }
  }
  return out;
}

/** Monday only. Called from the daily management-reminders cron. */
export async function sendPipelineFollowUpEmails(todayKey: string = todayEasternKey()): Promise<{ sent: number; skipped?: string }> {
  if (new Date(`${todayKey}T12:00:00Z`).getUTCDay() !== 1) return { sent: 0, skipped: "not Monday" };
  let sent = 0;
  for (const e of await buildFollowUpEmails(todayKey)) {
    try {
      await sendEmail({ type: e.type, to: e.to, subject: e.subject, html: e.html, link: "/erp/pipeline" });
      sent++;
    } catch (err) {
      console.error("Pipeline follow-up email", e.to, err);
    }
  }
  return { sent };
}
