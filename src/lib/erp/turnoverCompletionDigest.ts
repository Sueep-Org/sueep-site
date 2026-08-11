import { prisma } from "@/lib/prisma";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";
import { sendEmail, buildTurnoverCompletionDigestEmail } from "@/lib/email";
import { findEmployeeEmailByName, getDescLine } from "@/lib/erp/createLaborEntry";

function todayWindow() {
  const start = todayEasternAsUtcMidnight();
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
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
  unitCount: number;
  skippedBuildings: string[];
};

/** Emails each building's property manager one digest listing every
 * turnover unit that finished today, cc'ing contact@sueep.com and bcc'ing
 * every Sueep PM involved in that building's completions today — never sent
 * per-unit, and never sent at all when nothing completed (same "no empty
 * digest" rule sendScheduleNudgeEmails already follows). */
export async function sendTurnoverCompletionDigest(): Promise<TurnoverCompletionDigestResult> {
  const { start, end } = todayWindow();

  const completed = await prisma.project.findMany({
    where: {
      segment: "JANITORIAL_TURNOVER_REQUESTS",
      status: "COMPLETE",
      turnoverCompletedAt: { gte: start, lte: end },
      buildingId: { not: null },
    },
    select: {
      id: true,
      jobTitle: true,
      supervisor: true,
      description: true,
      supervisorUser: { select: { email: true } },
      building: { select: { id: true, name: true, address: true, pmEmail: true } },
      turnoverRequest: { select: { unitNumber: true } },
    },
  });

  if (completed.length === 0) {
    return { sent: false, buildingCount: 0, unitCount: 0, skippedBuildings: [] };
  }

  const byBuilding = new Map<string, typeof completed>();
  for (const p of completed) {
    if (!p.building) continue;
    const list = byBuilding.get(p.building.id) ?? [];
    list.push(p);
    byBuilding.set(p.building.id, list);
  }

  const skippedBuildings: string[] = [];
  let buildingsSent = 0;

  await Promise.allSettled(
    Array.from(byBuilding.values()).map(async (projects) => {
      const building = projects[0].building!;
      if (!building.pmEmail) {
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
          projectDate: { gt: end },
        },
        select: { jobTitle: true, projectDate: true, turnoverRequest: { select: { unitNumber: true } } },
        orderBy: { projectDate: "asc" },
      });

      const html = buildTurnoverCompletionDigestEmail({
        buildingName: building.name,
        buildingAddress: building.address,
        units: projects.map((p) => ({ jobTitle: p.jobTitle, unitNumber: p.turnoverRequest?.unitNumber ?? null })),
        upcoming: upcomingProjects.map((p) => ({
          jobTitle: p.jobTitle,
          unitNumber: p.turnoverRequest?.unitNumber ?? null,
          projectDate: p.projectDate!,
        })),
      });
      const plural = projects.length === 1 ? "unit" : "units";

      try {
        await sendEmail({
          to: building.pmEmail,
          cc: ["contact@sueep.com"],
          bcc: Array.from(pmEmails),
          subject: `${projects.length} ${plural} completed today at ${building.name}`,
          html,
        });
        buildingsSent++;
      } catch (e) {
        // Same fire-and-forget-but-logged pattern as notifyPmIfMarginWorsened
        // — one building's failed send shouldn't blow up the whole digest
        // run (Promise.allSettled already isolates it), but it must not
        // fail silently either.
        console.error(`Failed to send turnover completion digest for "${building.name}"`, e);
      }
    })
  );

  return {
    sent: buildingsSent > 0,
    buildingCount: buildingsSent,
    unitCount: completed.length,
    skippedBuildings,
  };
}
