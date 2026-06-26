import { buildJanitorialTurnoverProjectEmailHtml, formatUsd, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

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
  const recipients = uniqueEmails([
    isExternal ? (stringValue(body.pmEmail) || building.pmEmail || "") : "",
    stringValue(body.sueepPmEmail),
    "david@sueep.com",
    ...employeeEmails,
  ]);
  if (recipients.length === 0) return;

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

  try {
    await Promise.all(
      recipients.map((to) =>
        sendEmail({
          to,
          subject: `New Janitorial Turnover Submitted - ${building.name}`,
          html,
          replyTo: stringValue(body.sueepPmEmail) || undefined,
        })
      )
    );
  } catch (error) {
    console.error("janitorial turnover notification email", error);
  }
}
