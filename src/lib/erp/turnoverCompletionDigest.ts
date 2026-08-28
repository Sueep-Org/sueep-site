import { prisma } from "@/lib/prisma";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { sendEmail, buildTurnoverCompletionDigestEmail } from "@/lib/email";
import { findEmployeeEmailByName, getDescLine } from "@/lib/erp/createLaborEntry";

// A unit is still "news" to a property manager if it was marked complete
// within this many days of actually finishing. Past that, an email about it
// would just read as random old news landing in their inbox, so it's
// recorded (turnoverDigestSentAt gets stamped either way) but never emailed.
const RECENT_CUTOFF_DAYS = 5;

// How far back this cron will look at all. Guards against something like a
// future bulk data cleanup (hundreds of old projects re-touched at once)
// silently sweeping through this query the moment it next runs, anything
// older than this is left completely alone for a person to review.
const SAFETY_CEILING_DAYS = 60;

function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setUTCHours(23, 59, 59, 999);
  return e;
}

function daysBeforeToday(today: Date, days: number): Date {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

// turnoverCompletedAt is a calendar-day label stored as UTC midnight (see
// the date convention notes in dates.ts), same as `today` here, so a plain
// UTC day diff is exact, no timezone conversion needed.
function daysAgo(today: Date, date: Date): number {
  return Math.round((today.getTime() - date.getTime()) / 86400000);
}

/** Same PM-resolution fallback chain used for the turnover margin alert:
 * the project's supervisor name (or a legacy "SUEEP PM:" description line)
 * → Employee lookup by name → the assigned ERP login's email → a fixed
 * default. Kept here rather than inlined so every completed unit in a
 * building's digest resolves its PM the same, already-battle-tested way. */
async function resolveSueepPmEmail(project: {
  supervisor: string | null;
  description: string | null;
  supervisorUser: { email: string } | null;
}): Promise<string> {
  const pmName = project.supervisor?.trim() || getDescLine(project.description, "SUEEP PM");
  let recipient: string | null = null;
  if (pmName) recipient = await findEmployeeEmailByName(pmName);
  if (!recipient) recipient = project.supervisorUser?.email ?? null;
  if (!recipient) recipient = (process.env.DOCUSEAL_SUEEP_SIGNER_EMAIL ?? "david@sueep.com").trim();
  return recipient;
}

export type TurnoverCompletionDigestResult = {
  sent: boolean;
  buildingCount: number;
  /** Units actually emailed to a property manager this run. */
  unitCount: number;
  /** Units marked complete more than RECENT_CUTOFF_DAYS after they actually
   * finished, recorded as digested but deliberately not emailed, they're
   * too stale to be useful news by the time anyone got to them. */
  staleUnitCount: number;
  skippedBuildings: string[];
};

/** Emails each building's property manager one digest listing every
 * turnover unit that finished recently, cc'ing contact@sueep.com and
 * emma@sueep.com and bcc'ing every Sueep PM involved, never sent per-unit,
 * and never sent at all when there's nothing to report (same "no empty
 * digest" rule sendScheduleNudgeEmails already follows).
 *
 * Looks at every completed unit that hasn't been accounted for yet
 * (turnoverDigestSentAt IS NULL), not just what finished "today" — a unit
 * marked complete a few days late still gets caught on whatever run comes
 * next, instead of permanently missing its digest window. See
 * RECENT_CUTOFF_DAYS/SAFETY_CEILING_DAYS above for how stale/ancient
 * completions are handled instead of being emailed. */
export async function sendTurnoverCompletionDigest(): Promise<TurnoverCompletionDigestResult> {
  const today = todayEasternAsUtcMidnight();
  const endOfToday = endOfDay(today);
  const safetyFloor = daysBeforeToday(today, SAFETY_CEILING_DAYS);

  const undigested = await prisma.project.findMany({
    where: {
      segment: "JANITORIAL_TURNOVER_REQUESTS",
      status: "COMPLETE",
      turnoverCompletedAt: { not: null, gte: safetyFloor },
      turnoverDigestSentAt: null,
      buildingId: { not: null },
    },
    select: {
      id: true,
      jobTitle: true,
      supervisor: true,
      description: true,
      turnoverCompletedAt: true,
      supervisorUser: { select: { email: true } },
      building: { select: { id: true, name: true, address: true, pmEmail: true } },
      turnoverRequest: { select: { unitNumber: true } },
    },
  });

  if (undigested.length === 0) {
    return { sent: false, buildingCount: 0, unitCount: 0, staleUnitCount: 0, skippedBuildings: [] };
  }

  const recent = undigested.filter((p) => daysAgo(today, p.turnoverCompletedAt!) <= RECENT_CUTOFF_DAYS);
  const stale = undigested.filter((p) => daysAgo(today, p.turnoverCompletedAt!) > RECENT_CUTOFF_DAYS);

  // Stale completions are accounted for immediately, regardless of what
  // happens with any building's email below, there's nothing to send them
  // toward and nothing that can fail.
  if (stale.length > 0) {
    await prisma.project.updateMany({
      where: { id: { in: stale.map((p) => p.id) } },
      data: { turnoverDigestSentAt: new Date() },
    });
  }

  const byBuilding = new Map<string, typeof recent>();
  for (const p of recent) {
    if (!p.building) continue;
    const list = byBuilding.get(p.building.id) ?? [];
    list.push(p);
    byBuilding.set(p.building.id, list);
  }

  const skippedBuildings: string[] = [];
  let buildingsSent = 0;
  let unitsSent = 0;

  await Promise.allSettled(
    Array.from(byBuilding.values()).map(async (projects) => {
      const building = projects[0].building!;
      if (!building.pmEmail) {
        // Not stamped, purposely, so this building's units are picked up
        // again on the next run once a pmEmail is on file rather than
        // missing their digest permanently.
        console.warn(`Skipping turnover completion digest for "${building.name}" — no pmEmail on file`);
        skippedBuildings.push(building.name);
        return;
      }

      // Sueep PM(s) resolved for the completed units below go on bcc, so the
      // property manager doesn't see who else got a copy; contact@sueep.com
      // goes on cc instead (see sendEmail call below) so it's visible.
      const pmEmails = new Set<string>();
      for (const p of projects) {
        pmEmails.add(await resolveSueepPmEmail(p));
      }

      // Any other still-open turnover job at this same building with a
      // scheduled start date after today — gives the property manager a
      // heads-up on what's coming next, not just what just finished.
      const upcomingProjects = await prisma.project.findMany({
        where: {
          buildingId: building.id,
          segment: "JANITORIAL_TURNOVER_REQUESTS",
          status: { notIn: ["COMPLETE", "ARCHIVED"] },
          projectDate: { gt: endOfToday },
        },
        select: { jobTitle: true, projectDate: true, turnoverRequest: { select: { unitNumber: true } } },
        orderBy: { projectDate: "asc" },
      });

      const html = buildTurnoverCompletionDigestEmail({
        buildingName: building.name,
        buildingAddress: building.address,
        today,
        units: projects.map((p) => ({
          jobTitle: p.jobTitle,
          unitNumber: p.turnoverRequest?.unitNumber ?? null,
          completedAt: p.turnoverCompletedAt!,
        })),
        upcoming: upcomingProjects.map((p) => ({
          jobTitle: p.jobTitle,
          unitNumber: p.turnoverRequest?.unitNumber ?? null,
          projectDate: p.projectDate!,
        })),
      });
      const plural = projects.length === 1 ? "unit" : "units";
      // Only claim "today" in the subject when every unit in this
      // building's batch actually finished today, a late straggler mixed
      // in with today's units means the subject just states the count.
      const allToday = projects.every((p) => daysAgo(today, p.turnoverCompletedAt!) === 0);
      const subject = allToday
        ? `${projects.length} ${plural} completed today at ${building.name}`
        : `${projects.length} ${plural} completed at ${building.name}`;

      try {
        await sendEmail({
          to: building.pmEmail,
          cc: ["contact@sueep.com", "emma@sueep.com"],
          bcc: Array.from(pmEmails),
          subject,
          html,
        });
        await prisma.project.updateMany({
          where: { id: { in: projects.map((p) => p.id) } },
          data: { turnoverDigestSentAt: new Date() },
        });
        buildingsSent++;
        unitsSent += projects.length;
      } catch (e) {
        // Same fire-and-forget-but-logged pattern as notifyPmIfMarginWorsened
        // — one building's failed send shouldn't blow up the whole digest
        // run (Promise.allSettled already isolates it), but it must not
        // fail silently either. Not stamped, so it retries next run.
        console.error(`Failed to send turnover completion digest for "${building.name}"`, e);
      }
    })
  );

  return {
    sent: buildingsSent > 0,
    buildingCount: buildingsSent,
    unitCount: unitsSent,
    staleUnitCount: stale.length,
    skippedBuildings,
  };
}
