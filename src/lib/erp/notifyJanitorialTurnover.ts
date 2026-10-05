import { buildJanitorialTurnoverProjectEmailHtml, formatUsd, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getNotificationSetting } from "@/lib/notificationSettings";

type TurnoverRequestForEmail = {
  unitNumber: string | null;
  startDate: Date | null;
  endDate: Date | null;
  priceCents: number | null;
};

type BuildingForEmail = {
  id: string;
  name: string;
  address: string;
  pmName: string | null;
  pmEmail: string | null;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueEmails(values: string[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const email = value.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) return [];
    seen.add(key);
    return [email];
  });
}

function dateLabel(date: Date | null | undefined) {
  return date ? date.toISOString().split("T")[0] : null;
}

function minDate(dates: (Date | null)[]) {
  return dates.filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

function maxDate(dates: (Date | null)[]) {
  const sorted = dates.filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime());
  return sorted[sorted.length - 1] ?? null;
}

function projectUrl(buildingId: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  if (!appUrl) return null;
  return `${appUrl.replace(/\/$/, "")}/pm-view?building=${buildingId}`;
}

export async function notifyJanitorialTurnoverCreated(params: {
  body: Record<string, unknown>;
  building: BuildingForEmail;
  requests: TurnoverRequestForEmail[];
  notifyEmployeeIds?: string[];
}) {
  const { body, building, requests, notifyEmployeeIds = [] } = params;
  
  // Resolve employee emails from database
  const employeeEmails: string[] = [];
  if (notifyEmployeeIds.length > 0) {
    const employees = await prisma.employee.findMany({
      where: { id: { in: notifyEmployeeIds } },
      select: { email: true },
    });
    employeeEmails.push(...employees.map((e) => e.email).filter((email): email is string => Boolean(email)));
  }
  
  const isExternal = body.source === "external";
  // Staff share one email; the property manager on a client submission gets
  // their own copy so they don't see Sueep's internal addresses.
  const staff = uniqueEmails([
    stringValue(body.sueepPmEmail),
    // Plus the Notifications page's "Also send to" list (David and Jennifer to start).
    ...(await getNotificationSetting("JANITORIAL_TURNOVER_SUBMITTED")).to,
    ...employeeEmails,
  ]);
  const clientPm = isExternal ? stringValue(body.pmEmail) || building.pmEmail || "" : "";
  const groups = [staff, ...(clientPm && !staff.some((e) => e.toLowerCase() === clientPm.toLowerCase()) ? [[clientPm]] : [])].filter(
    (g) => g.length > 0
  );
  if (groups.length === 0) return;

  const totalCents = requests.reduce((sum, request) => sum + (request.priceCents ?? 0), 0);
  const unitNumbers = requests.map((request, index) => request.unitNumber || `Unit ${index + 1}`).join(", ");
  const html = buildJanitorialTurnoverProjectEmailHtml({
    projectTitle: stringValue(body.jobTitle) || `${building.name} - Janitorial turnover`,
    propertyName: stringValue(body.buildingName) || building.name,
    propertyAddress: stringValue(body.buildingAddress) || building.address,
    managerName: stringValue(body.pmName) || building.pmName,
    sueepPmName: stringValue(body.sueepPmName),
    unitNumbers,
    startDate: dateLabel(minDate(requests.map((request) => request.startDate))),
    endDate: dateLabel(maxDate(requests.map((request) => request.endDate))),
    estimatedTotal: totalCents > 0 ? formatUsd(totalCents) : null,
    details: stringValue(body.description) || null,
    projectUrl: projectUrl(building.id),
  });

  const results = await Promise.allSettled(
    groups.map((to) =>
      sendEmail({
        type: "JANITORIAL_TURNOVER_SUBMITTED",
        link: `/erp/buildings/${building.id}`,
        to,
        subject: `New janitorial turnover: ${building.name}`,
        html,
        replyTo: stringValue(body.sueepPmEmail) || undefined,
      })
    )
  );
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`janitorial turnover notification email failed for ${groups[i].join(", ")}`, result.reason);
    }
  });
}
