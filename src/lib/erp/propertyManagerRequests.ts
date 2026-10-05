/**
 * Turnovers property managers request on their link. Saved as a
 * PropertyManagerRequest until staff confirm it. Server only.
 */

import { createHash } from "crypto";
import type { PropertyManagerRequest } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildPropertyManagerConfirmedEmail,
  buildPropertyManagerDeclinedEmail,
  buildPropertyManagerRequestEmail,
  sendEmail,
} from "@/lib/email";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { createProjectFromPayload } from "./createProject";
import { inputToCents } from "./money";
import { emailExtrasFor } from "./propertyManagerAccess";
import { buildTurnoverCalendarFile } from "@/lib/calendarInvite";
import { getTurnoverPricingPackage } from "@/lib/turnoverPricingPackages";
import { todayEasternKey } from "./dates";
import type { LinkedManager } from "./propertyManagerAccess";
import { REQUEST_LAYOUTS, estimateRequestCents, requestLayoutLabel, requestWorkLabels } from "./propertyManagerRequestShared";

/** Stops a forwarded or misused link from flooding the queue. */
const MAX_OPEN_REQUESTS = 50;

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

/** A YYYY-MM-DD string as a UTC-midnight date, or null. */
function dayValue(v: unknown): Date | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDay(d: Date | null): string | null {
  return d ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

/** Units in one booking from the link. */
const MAX_UNITS_PER_BOOKING = 10;

/**
 * A booking from a property manager's link: one or more units at one
 * building, sharing a start date and notes. Everything is checked before
 * anything is saved, so a booking goes in whole or not at all.
 */
export async function createPropertyManagerRequests(
  manager: LinkedManager,
  body: Record<string, unknown>,
): Promise<{ ids: string[] } | { error: string }> {
  const buildingId = text(body.buildingId, 100);
  const link = buildingId
    ? await prisma.propertyManagerBuilding.findUnique({
        where: { propertyManagerId_buildingId: { propertyManagerId: manager.id, buildingId } },
        select: { building: { select: { id: true, name: true, pricingPackage: true } } },
      })
    : null;
  if (!link) return { error: "Pick one of your buildings" };
  const building = link.building;

  const requestedStartDate = dayValue(body.requestedStartDate);
  if (!requestedStartDate) return { error: "Pick a start date" };
  if (body.requestedStartDate! < todayEasternKey()) return { error: "The start date can't be in the past" };
  const notes = text(body.notes, 2000);

  const rawUnits = Array.isArray(body.units) ? body.units.filter((u): u is Record<string, unknown> => !!u && typeof u === "object") : [];
  if (!rawUnits.length) return { error: "Add at least one unit" };
  if (rawUnits.length > MAX_UNITS_PER_BOOKING) return { error: `Book up to ${MAX_UNITS_PER_BOOKING} units at a time` };

  const pricingPackage = getTurnoverPricingPackage(building.name, building.pricingPackage);
  const units = [];
  const seen = new Set<string>();
  for (const u of rawUnits) {
    const unitNumber = text(u.unitNumber, 40)?.replace(/^#/, "");
    if (!unitNumber) return { error: "Enter every unit number" };
    const name = `Unit ${unitNumber}`;
    if (seen.has(unitNumber.toLowerCase())) return { error: `${name} is in the list twice` };
    seen.add(unitNumber.toLowerCase());

    const layout = REQUEST_LAYOUTS.find((l) => l.value === u.layout);
    if (!layout) return { error: `${name}: pick its bedrooms and bathrooms` };
    const work = {
      fullClean: u.fullClean === true,
      fullPaint: u.fullPaint === true,
      touchUpPaint: u.touchUpPaint === true && u.fullPaint !== true,
      carpetCleaning: u.carpetCleaning === true,
    };
    const otherWork = u.otherWork === true;
    const otherDescription = otherWork ? text(u.otherDescription, 500) : null;
    if (otherWork && !otherDescription) return { error: `${name}: describe the other work` };
    if (!work.fullClean && !work.fullPaint && !work.touchUpPaint && !work.carpetCleaning && !otherWork) {
      return { error: `${name}: pick at least one kind of work` };
    }
    const moveOutDate = dayValue(u.moveOutDate);
    const moveInDate = dayValue(u.moveInDate);
    if (moveOutDate && moveInDate && moveInDate < moveOutDate) return { error: `${name}: move-in can't be before move-out` };
    if (moveInDate && moveInDate < requestedStartDate) return { error: `${name}: move-in is before the start date. Pick an earlier start.` };

    units.push({
      unitNumber,
      bedrooms: layout.bedrooms,
      bathrooms: layout.bathrooms,
      ...work,
      otherWork,
      otherDescription,
      moveOutDate,
      moveInDate,
      estimateCents: estimateRequestCents(pricingPackage, layout.bedrooms, layout.bathrooms, work),
    });
  }

  const [duplicate, openCount] = await Promise.all([
    prisma.propertyManagerRequest.findFirst({
      where: {
        buildingId: building.id,
        status: "REQUESTED",
        OR: units.map((u) => ({ unitNumber: { equals: u.unitNumber, mode: "insensitive" as const } })),
      },
      select: { unitNumber: true },
    }),
    prisma.propertyManagerRequest.count({ where: { propertyManagerId: manager.id, status: "REQUESTED" } }),
  ]);
  if (duplicate) return { error: `Unit ${duplicate.unitNumber} already has a request waiting for Sueep to confirm.` };
  if (openCount + units.length > MAX_OPEN_REQUESTS) return { error: "You have a lot of requests waiting. Contact Sueep before sending more." };

  const requests = await prisma.$transaction(
    units.map((u) =>
      prisma.propertyManagerRequest.create({
        data: {
          propertyManagerId: manager.id,
          requesterName: manager.name,
          requesterEmail: manager.email,
          buildingId: building.id,
          requestedStartDate,
          notes,
          ...u,
        },
      }),
    ),
  );

  await emailStaffAboutRequests(requests, building.name);
  return { ids: requests.map((r) => r.id) };
}

/** The new-request email to staff, for link and website requests alike. One email per booking, however many units. */
async function emailStaffAboutRequests(requests: PropertyManagerRequest[], buildingName: string) {
  const first = requests[0];
  if (!first) return;
  try {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://app.sueep.com").replace(/\/$/, "");
    const fromWebsite = first.source === "WEBSITE";
    const estimate = (r: PropertyManagerRequest) => (r.otherWork ? `${money(r.estimateCents)} plus other work` : money(r.estimateCents));
    const total = requests.reduce((n, r) => n + r.estimateCents, 0);
    const unitList = requests.map((r) => `#${r.unitNumber}`).join(", ");
    await sendEmail({
      type: "PROPERTY_MANAGER_TURNOVER_REQUESTED",
      link: "/erp/property-managers/requests",
      replyTo: first.requesterEmail,
      subject: `${fromWebsite ? "Website turnover request" : "Turnover request"}: ${buildingName} ${unitList}`,
      html: buildPropertyManagerRequestEmail({
        requester: fromWebsite
          ? `${first.requesterName} (${first.requesterEmail}${first.requesterPhone ? `, ${first.requesterPhone}` : ""}), on the website form,`
          : first.requesterName,
        building: buildingName,
        start: formatDay(first.requestedStartDate)!,
        units: requests.map((r) => ({
          unit: `#${r.unitNumber}`,
          layout: requestLayoutLabel(r.bedrooms, r.bathrooms, r.isCommonArea),
          work: requestWorkLabels(r),
          estimate: estimate(r),
          moveOut: formatDay(r.moveOutDate),
          moveIn: formatDay(r.moveInDate),
        })),
        total: requests.length > 1 ? `${money(total)}${requests.some((r) => r.otherWork) ? " plus other work" : ""}` : null,
        notes: first.notes,
        url: `${appUrl}/erp/property-managers/requests`,
      }),
    });
  } catch (e) {
    console.error("Property manager request email failed:", e);
  }
}

/** Website submissions allowed per IP per hour, and per email per day. */
const WEBSITE_PER_IP_HOUR = 5;
const WEBSITE_PER_EMAIL_DAY = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIT_QUALITIES = ["GOOD", "FAIR", "POOR"];

function hashIp(ip: string): string {
  return createHash("sha256").update(`${process.env.ERP_SESSION_SECRET ?? ""}:${ip}`).digest("hex");
}

function intIn(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * The public turnover form on sueep.com. Saves a request for staff to
 * confirm, never a project. Prices are worked out here from the building's
 * pricing package; nothing the browser says about price is used.
 * `website` is a hidden field people never see, so anything in it means a bot.
 */
export async function createWebsiteRequest(body: Record<string, unknown>, ip: string | null): Promise<{ ok: true } | { error: string }> {
  if (text(body.website, 200)) return { ok: true };

  const buildingId = text(body.buildingId, 100);
  const building = buildingId ? await prisma.building.findUnique({ where: { id: buildingId }, select: { id: true, name: true, pricingPackage: true } }) : null;
  if (!building) return { error: "Please select a building." };

  const isCommonArea = body.isCommonArea === true;
  const unitNumber = text(body.unitNumber, 40)?.replace(/^#/, "") ?? (isCommonArea ? "Common Area" : null);
  if (!unitNumber) return { error: "Please enter the unit number." };
  const bedrooms = isCommonArea ? 0 : intIn(body.bedrooms, 0, 9);
  const bathrooms = isCommonArea ? 0 : intIn(body.bathrooms, 1, 9);
  if (bedrooms == null || bathrooms == null) return { error: "Please pick the bedrooms and bathrooms." };

  const work = {
    fullClean: body.fullClean === true,
    fullPaint: body.fullPaint === true,
    touchUpPaint: body.touchUpPaint === true && body.fullPaint !== true,
    carpetCleaning: body.carpetCleaning === true,
  };
  const otherWork = body.otherWork === true;
  const otherDescription = otherWork ? text(body.otherDescription, 500) : null;
  if (otherWork && !otherDescription) return { error: "Please describe the other work needed." };
  if (!work.fullClean && !work.fullPaint && !work.touchUpPaint && !work.carpetCleaning && !otherWork) {
    return { error: "Please pick at least one service." };
  }

  const requestedStartDate = dayValue(body.startDate);
  if (!requestedStartDate) return { error: "Target start date is required." };
  if (body.startDate! < todayEasternKey()) return { error: "The start date can't be in the past." };
  const requestedEndDate = dayValue(body.endDate);
  if (requestedEndDate && requestedEndDate < requestedStartDate) return { error: "The end date can't be before the start date." };

  const requesterName = text(body.name, 120);
  const requesterEmail = text(body.email, 200)?.toLowerCase() ?? null;
  if (!requesterName) return { error: "Your name is required." };
  if (!requesterEmail || !EMAIL_RE.test(requesterEmail)) return { error: "Please enter a valid email." };

  const submitterIpHash = ip ? hashIp(ip) : null;
  const [fromIp, fromEmail, duplicate] = await Promise.all([
    submitterIpHash
      ? prisma.propertyManagerRequest.count({ where: { submitterIpHash, createdAt: { gte: new Date(Date.now() - 3600e3) } } })
      : 0,
    prisma.propertyManagerRequest.count({ where: { source: "WEBSITE", requesterEmail, createdAt: { gte: new Date(Date.now() - 864e5) } } }),
    prisma.propertyManagerRequest.findFirst({
      where: { buildingId: building.id, status: "REQUESTED", unitNumber: { equals: unitNumber, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  if (fromIp >= WEBSITE_PER_IP_HOUR || fromEmail >= WEBSITE_PER_EMAIL_DAY) {
    return { error: "We've received a lot of requests from you. Please try again later or email us." };
  }
  if (duplicate) return { error: `There's already a request waiting for unit ${unitNumber}. Sueep will be in touch about it.` };

  const pricingPackage = getTurnoverPricingPackage(building.name, building.pricingPackage);
  const unitQuality = typeof body.unitQuality === "string" && UNIT_QUALITIES.includes(body.unitQuality) ? body.unitQuality : null;

  const request = await prisma.propertyManagerRequest.create({
    data: {
      source: "WEBSITE",
      requesterName,
      requesterEmail,
      requesterPhone: text(body.phone, 50),
      submitterIpHash,
      buildingId: building.id,
      unitNumber,
      bedrooms,
      bathrooms,
      isCommonArea,
      sqft: intIn(body.sqft, 1, 100000),
      unitQuality,
      ...work,
      otherWork,
      otherDescription,
      requestedStartDate,
      requestedEndDate,
      notes: text(body.notes, 2000),
      estimateCents: estimateRequestCents(pricingPackage, bedrooms, bathrooms, work, isCommonArea),
    },
  });
  await emailStaffAboutRequests([request], building.name);
  return { ok: true };
}

/** "Add to my calendar" file for a property manager's turnover. Same uid per unit, so a moved date replaces the old event. */
export function turnoverCalendarAttachment(params: {
  projectId: string;
  building: string;
  unit: string;
  address: string | null;
  start: Date;
  end: Date | null;
  url: string | null;
}) {
  const ics = buildTurnoverCalendarFile({
    uid: `pm-turnover-${params.projectId}@sueep.com`,
    startKey: params.start.toISOString().slice(0, 10),
    endKey: (params.end ?? params.start).toISOString().slice(0, 10),
    summary: `Sueep turnover: ${params.building} ${params.unit}`,
    description: "Sueep turnover. Questions? Reply to the email this came with.",
    location: params.address ?? undefined,
    url: params.url ?? undefined,
    sequence: Math.floor(Date.now() / 1000),
  });
  return { filename: "Sueep turnover.ics", content: Buffer.from(ics, "utf8") };
}

function dayRange(start: Date, end: Date | null): string {
  if (!end || end.getTime() === start.getTime()) return formatDay(start)!;
  return `${formatDay(start)} to ${formatDay(end)}`;
}

/**
 * Staff confirm a request: it becomes a normal turnover unit (TurnoverRequest
 * plus Project, the same way the turnover form makes them) with the date and
 * price staff settled on, and the property manager is emailed.
 */
export async function confirmPropertyManagerRequest(
  id: string,
  body: Record<string, unknown>,
  staffEmail: string,
): Promise<{ projectId: string } | { error: string }> {
  const start = dayValue(body.startDate);
  if (!start) return { error: "Pick the start date" };
  const end = dayValue(body.endDate);
  if (end && end < start) return { error: "The end date can't be before the start" };
  const priceCents = inputToCents(body.price);
  if (priceCents == null || priceCents < 0) return { error: "Enter the price" };
  const staffMessage = text(body.message, 2000);

  const request = await prisma.propertyManagerRequest.findUnique({ where: { id }, include: { building: { select: { name: true, address: true } } } });
  if (!request) return { error: "Request not found" };

  // Claim it first so two people confirming at once can't make two units.
  const claimed = await prisma.propertyManagerRequest.updateMany({
    where: { id, status: "REQUESTED" },
    data: {
      status: "CONFIRMED",
      confirmedStartDate: start,
      confirmedEndDate: end,
      priceCents,
      staffMessage,
      decidedBy: staffEmail,
      decidedAt: new Date(),
    },
  });
  if (!claimed.count) return { error: "Someone already handled this request" };

  let projectId: string;
  try {
    const cfg = parseHubSpotPipelineStageMap();
    const where = request.source === "WEBSITE" ? "on the website form" : "on their property manager link";
    const phone = request.requesterPhone ? `, ${request.requesterPhone}` : "";
    const comments = [`Requested by ${request.requesterName} (${request.requesterEmail}${phone}) ${where}.`, request.notes].filter(Boolean).join("\n");
    const result = await createProjectFromPayload({
      segment: "JANITORIAL_TURNOVER_REQUESTS",
      ...(cfg?.janitorial.pipelineId ? { hubspotPipelineId: cfg.janitorial.pipelineId } : {}),
      buildingId: request.buildingId,
      pmEmail: request.requesterEmail,
      description: `Comments: ${comments}`,
      unitScopes: [
        {
          unitNumber: request.unitNumber,
          startDate: start.toISOString().slice(0, 10),
          endDate: (end ?? start).toISOString().slice(0, 10),
          moveOutDate: request.moveOutDate?.toISOString().slice(0, 10),
          moveInDate: request.moveInDate?.toISOString().slice(0, 10),
          bedrooms: request.bedrooms,
          bathrooms: request.bathrooms,
          isCommonArea: request.isCommonArea,
          sqft: request.sqft,
          unitQuality: request.unitQuality,
          fullClean: request.fullClean,
          fullPaint: request.fullPaint,
          touchUpPaint: request.touchUpPaint,
          carpetCleaning: request.carpetCleaning,
          otherWork: request.otherWork,
          otherDescription: request.otherDescription,
        },
      ],
    });
    if ("error" in result) throw new Error(result.error);
    const project = "projects" in result ? result.projects?.[0] : undefined;
    const turnover = "turnoverRequests" in result ? result.turnoverRequests?.[0] : undefined;
    if (!project || !turnover) throw new Error("No unit was created");
    projectId = project.id;

    // The form math priced it from the building's rates; staff's price is the real one.
    if (turnover.priceCents !== priceCents) {
      const total = `Estimated Unit Total: $${(priceCents / 100).toFixed(0)}`;
      const description = (project.description ?? "")
        .split("\n")
        .filter((l) => !l.startsWith("Estimated Unit Total:"))
        .concat(priceCents > 0 ? [total] : [])
        .join("\n");
      await prisma.$transaction([
        prisma.turnoverRequest.update({ where: { id: turnover.id }, data: { priceCents } }),
        prisma.project.update({ where: { id: project.id }, data: { contractValueCents: priceCents, description } }),
      ]);
    }
    await prisma.propertyManagerRequest.update({ where: { id }, data: { projectId } });
  } catch (e) {
    console.error("Confirming property manager request failed:", e);
    await prisma.propertyManagerRequest.update({
      where: { id },
      data: { status: "REQUESTED", confirmedStartDate: null, confirmedEndDate: null, priceCents: null, staffMessage: null, decidedBy: null, decidedAt: null },
    });
    return { error: "Couldn't create the unit. Nothing was changed, try again." };
  }

  try {
    const changes: string[] = [];
    if (start.getTime() !== request.requestedStartDate.getTime()) {
      changes.push(`The start date changed from the ${formatDay(request.requestedStartDate)} you asked for.`);
    }
    if (priceCents !== request.estimateCents) {
      changes.push(
        request.otherWork
          ? `The price includes the other work (${request.otherDescription ?? "other"}). Your estimate was ${money(request.estimateCents)} before that.`
          : `The price changed from the ${money(request.estimateCents)} estimate.`,
      );
    }
    const { url, contact } = await emailExtrasFor(request.propertyManagerId);
    await sendEmail({
      type: "PROPERTY_MANAGER_REQUEST_CONFIRMED",
      to: request.requesterEmail,
      link: `/erp/projects/${projectId}`,
      attachments: [
        turnoverCalendarAttachment({
          projectId,
          building: request.building.name,
          unit: `#${request.unitNumber}`,
          address: request.building.address,
          start,
          end,
          // Not the email's sign-in button: calendar events get shared.
          url: null,
        }),
      ],
      subject: `Scheduled: ${request.building.name} #${request.unitNumber}, ${formatDay(start)}`,
      html: buildPropertyManagerConfirmedEmail({
        firstName: request.requesterName.split(" ")[0] || request.requesterName,
        building: request.building.name,
        unit: `#${request.unitNumber}`,
        dates: dayRange(start, end),
        price: money(priceCents),
        changes,
        message: staffMessage,
        url,
        contact,
      }),
    });
  } catch (e) {
    console.error("Request confirmed email failed:", e);
  }

  return { projectId };
}

export async function declinePropertyManagerRequest(
  id: string,
  body: Record<string, unknown>,
  staffEmail: string,
): Promise<{ ok: true } | { error: string }> {
  const declineReason = text(body.reason, 500);
  if (!declineReason) return { error: "Give a reason. The property manager sees it." };
  const staffMessage = text(body.message, 2000);

  const request = await prisma.propertyManagerRequest.findUnique({ where: { id }, include: { building: { select: { name: true } } } });
  if (!request) return { error: "Request not found" };
  const claimed = await prisma.propertyManagerRequest.updateMany({
    where: { id, status: "REQUESTED" },
    data: { status: "DECLINED", declineReason, staffMessage, decidedBy: staffEmail, decidedAt: new Date() },
  });
  if (!claimed.count) return { error: "Someone already handled this request" };

  try {
    const { url, contact } = await emailExtrasFor(request.propertyManagerId);
    await sendEmail({
      type: "PROPERTY_MANAGER_REQUEST_DECLINED",
      to: request.requesterEmail,
      link: "/erp/property-managers/requests?status=DECLINED",
      subject: `Turnover request: ${request.building.name} #${request.unitNumber}`,
      html: buildPropertyManagerDeclinedEmail({
        firstName: request.requesterName.split(" ")[0] || request.requesterName,
        building: request.building.name,
        unit: `#${request.unitNumber}`,
        reason: declineReason,
        message: staffMessage,
        url,
        contact,
      }),
    });
  } catch (e) {
    console.error("Request declined email failed:", e);
  }
  return { ok: true };
}
