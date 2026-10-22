/**
 * Property manager approval of sub change order requests. Once a request is
 * priced (READY) it's emailed to the building's property managers with the
 * team copied (SUB_CO_APPROVAL). The email's Approve / Deny buttons open
 * /co-approve/[token]; only pressing a button there records the answer,
 * because email scanners open links on their own.
 *
 * The property manager sees our charge only, never the sub pay or the sub.
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { centsToDollars } from "./money";
import { applySubCoAnswer, subCoRequestsPath } from "./subCoOutcome";

export { subCoRequestsPath };

type Manager = { id: string | null; name: string; email: string; contact: { name: string | null; phone: string | null; email: string | null } | null };

/** Who gets the approval email: the building's active property manager links, else the building's contact email. */
export async function propertyManagersFor(buildingId: string | null | undefined): Promise<Manager[]> {
  if (!buildingId) return [];
  const [links, building] = await Promise.all([
    prisma.propertyManagerBuilding.findMany({
      where: { buildingId, propertyManager: { active: true } },
      select: { propertyManager: { select: { id: true, name: true, email: true, sueepContactName: true, sueepContactPhone: true, sueepContactEmail: true } } },
    }),
    prisma.building.findUnique({ where: { id: buildingId }, select: { pmName: true, pmEmail: true } }),
  ]);
  const fromLinks = links
    .map((l) => l.propertyManager)
    .filter((m) => m.email)
    .map((m) => ({ id: m.id, name: m.name, email: m.email, contact: { name: m.sueepContactName, phone: m.sueepContactPhone, email: m.sueepContactEmail } }));
  if (fromLinks.length) return fromLinks;
  const email = building?.pmEmail?.trim();
  return email ? [{ id: null, name: building?.pmName?.trim() || email, email, contact: null }] : [];
}

export async function propertyManagerEmailsFor(buildingId: string | null | undefined): Promise<{ name: string; email: string }[]> {
  return (await propertyManagersFor(buildingId)).map(({ name, email }) => ({ name, email }));
}

function appUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  return /your-vercel-domain/.test(base) ? "" : base;
}

export function isApprovalToken(token: string): boolean {
  return /^[a-f0-9]{48}$/.test(token);
}

const loadRequest = (where: { id: string } | { pmToken: string }) =>
  prisma.subCoRequest.findUnique({
    where,
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      photos: { select: { id: true }, orderBy: { createdAt: "asc" } },
      project: { select: { id: true, jobTitle: true, buildingId: true, building: { select: { name: true, address: true } } } },
    },
  });

type Loaded = NonNullable<Awaited<ReturnType<typeof loadRequest>>>;

/** Charge-side lines as the property manager sees them. */
function chargeLines(r: Loaded) {
  const lines = r.items.map((i) => ({
    label: i.description ? `${i.label}: ${i.description}` : i.label,
    quantity: i.quantity,
    unitCents: i.unitChargeCents ?? 0,
    totalCents: (i.unitChargeCents ?? 0) * i.quantity,
  }));
  const base = lines.reduce((s, l) => s + l.totalCents, 0);
  const surcharge = r.surchargePercent ? { label: r.surchargeLabel ?? "Surcharge", percent: r.surchargePercent, cents: r.chargeTotalCents - base } : null;
  return { lines, surcharge, totalCents: r.chargeTotalCents };
}

function unitName(r: Loaded): string {
  const b = r.project.building?.name;
  return b && !r.project.jobTitle.includes(b) ? `${r.project.jobTitle} (${b})` : r.project.jobTitle;
}

function approvalEmailHtml(r: Loaded, token: string, updated: boolean, contact: Manager["contact"], reminder = false): string {
  const base = appUrl();
  const page = `${base}/co-approve/${token}`;
  const { lines, surcharge, totalCents } = chargeLines(r);
  const cell = "padding:6px 8px;border-bottom:1px solid #eee";
  const rows = lines
    .map((l) => `<tr><td style="${cell}">${l.quantity > 1 ? `${l.quantity} × ` : ""}${escapeHtml(l.label)}</td><td style="${cell};text-align:right;white-space:nowrap">${escapeHtml(centsToDollars(l.totalCents))}</td></tr>`)
    .join("");
  const surchargeRow = surcharge
    ? `<tr><td style="${cell}">${escapeHtml(surcharge.label)} (+${surcharge.percent}%)</td><td style="${cell};text-align:right;white-space:nowrap">${escapeHtml(centsToDollars(surcharge.cents))}</td></tr>`
    : "";
  const photos = r.photos
    .map((p) => {
      const src = `${base}/api/co-approve/${token}/photos/${p.id}`;
      return `<a href="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="Photo" width="120" height="120" style="width:120px;height:120px;object-fit:cover;border-radius:6px;margin:0 6px 6px 0"></a>`;
    })
    .join("");
  const btn = (label: string, bg: string, answer: string) =>
    `<a href="${escapeHtml(`${page}?answer=${answer}`)}" style="display:inline-block;padding:10px 18px;margin-right:8px;border-radius:6px;background:${bg};color:#fff;text-decoration:none;font-weight:600">${label}</a>`;
  const who = contact?.name ? `${escapeHtml(contact.name)}${contact.phone ? ` at ${escapeHtml(contact.phone)}` : ""}` : null;
  return `
    <h2 style="margin:0 0 12px;color:#E73C6E">${reminder ? "Reminder: change order waiting for your answer" : updated ? "Updated change order for approval" : "Change order for approval"}</h2>
    <p>${reminder ? "We're still waiting to hear if we can do this extra work. " : ""}While working on <strong>${escapeHtml(unitName(r))}</strong>, our crew found extra work that isn't in the turnover.${updated && !reminder ? " The office updated this request; please use these prices." : ""}</p>
    ${photos ? `<p>${photos}</p>` : ""}
    <table style="border-collapse:collapse;font-size:14px;min-width:320px">${rows}${surchargeRow}<tr><td style="padding:8px"><strong>Total</strong></td><td style="padding:8px;text-align:right"><strong>${escapeHtml(centsToDollars(totalCents))}</strong></td></tr></table>
    <p style="margin:20px 0 4px">Can we do this work?</p>
    <p>${btn("Approve", "#16a34a", "approve")}${btn("Deny", "#6b7280", "deny")}</p>
    <p style="color:#6b7280;font-size:13px">We won't start the extra work until you approve it.${who ? ` Questions? Call ${who}, or reply to this email.` : " Questions? Reply to this email."}</p>
  `;
}

type Fail = { error: string };

/**
 * Emails the request to the property managers (team copied). From READY, or
 * again from WAITING_PM after the office changes it. Stays READY when the
 * email can't go out, so the office can try again.
 */
export async function sendToPropertyManager(id: string, actor: string, opts: { updated?: boolean } = {}): Promise<Fail | { ok: true }> {
  const r = await loadRequest({ id });
  if (!r) return { error: "Not found" };
  if (!["READY", "WAITING_PM"].includes(r.status)) return { error: "This request isn't ready for the property manager." };
  if (r.items.some((i) => i.unitChargeCents == null || i.unitSubPayCents == null)) return { error: "Every line needs a price first." };
  const managers = await propertyManagersFor(r.project.buildingId);
  if (!managers.length) return { error: "No property manager email for this building." };
  if (!appUrl()) {
    await prisma.subCoRequestEvent.create({ data: { requestId: id, actor: "Sueep", text: "Couldn't email the property manager: the app address isn't set on this server" } });
    return { error: "The app address isn't set on this server, so the email would have no working buttons." };
  }

  const token = r.pmToken ?? randomBytes(24).toString("hex");
  if (!r.pmToken) await prisma.subCoRequest.update({ where: { id }, data: { pmToken: token } });
  const to = managers.map((m) => m.email);
  const contact = managers.find((m) => m.contact?.name || m.contact?.email)?.contact ?? null;
  const updated = !!opts.updated || !!r.pmSentAt;
  const result = await sendEmail({
    type: "SUB_CO_APPROVAL",
    to,
    replyTo: contact?.email ?? undefined,
    link: subCoRequestsPath(r.project.id),
    subject: `${updated ? "Updated: " : ""}Change order for approval, ${unitName(r)}`,
    html: approvalEmailHtml(r, token, updated, contact),
  });
  if (result !== "SENT") {
    const why = result === "OFF" ? "this email is turned off on the Notifications page" : result === "SKIPPED" ? "email isn't set up on this server" : "no one to send it to";
    await prisma.subCoRequestEvent.create({ data: { requestId: id, actor: "Sueep", text: `Couldn't email the property manager: ${why}` } });
    return { error: `Couldn't email the property manager: ${why}.` };
  }
  await prisma.$transaction([
    prisma.subCoRequest.update({ where: { id }, data: { status: "WAITING_PM", pmSentAt: new Date(), pmSentTo: to } }),
    prisma.subCoRequestEvent.create({ data: { requestId: id, actor, text: `${updated ? "Emailed the update" : "Emailed"} to the property manager (${to.join(", ")})` } }),
  ]);
  return { ok: true };
}

export type ApprovalView = {
  unit: string;
  address: string | null;
  lines: { label: string; quantity: number; totalCents: number }[];
  surcharge: { label: string; percent: number; cents: number } | null;
  totalCents: number;
  photoIds: string[];
  /** open: can answer. approved / denied: answered. withdrawn: office cancelled. updating: office is changing it. */
  state: "open" | "approved" | "denied" | "withdrawn" | "updating";
  answeredAt: string | null;
  denyReason: string | null;
  contact: { name: string | null; phone: string | null; email: string | null } | null;
};

/** The property manager's page. Charge side only. */
export async function loadApprovalView(token: string): Promise<ApprovalView | null> {
  if (!isApprovalToken(token)) return null;
  const r = await loadRequest({ pmToken: token });
  if (!r) return null;
  const { lines, surcharge, totalCents } = chargeLines(r);
  const managers = await propertyManagersFor(r.project.buildingId);
  const state =
    r.status === "WAITING_PM" ? "open" : r.status === "APPROVED" ? "approved" : r.status === "DENIED" ? "denied" : r.status === "CANCELLED" ? "withdrawn" : "updating";
  return {
    unit: unitName(r),
    address: r.project.building?.address ?? null,
    lines: lines.map(({ label, quantity, totalCents }) => ({ label, quantity, totalCents })),
    surcharge,
    totalCents,
    photoIds: r.photos.map((p) => p.id),
    state,
    answeredAt: r.pmAnsweredAt?.toISOString() ?? null,
    denyReason: r.pmDenyReason,
    contact: managers.find((m) => m.contact?.name || m.contact?.email)?.contact ?? null,
  };
}

/** Approve or Deny from the property manager's page. Once answered it can't be changed there. */
export async function recordPmAnswer(token: string, answer: "APPROVED" | "DENIED", reasonRaw: string | null): Promise<Fail | { state: ApprovalView["state"] }> {
  if (!isApprovalToken(token)) return { error: "This link isn't valid anymore." };
  const r = await prisma.subCoRequest.findUnique({ where: { pmToken: token }, select: { id: true, status: true } });
  if (!r) return { error: "This link isn't valid anymore." };
  if (r.status === "APPROVED" || r.status === "DENIED") return { error: "This change order was already answered." };
  if (r.status === "CANCELLED") return { error: "We withdrew this request, so there's nothing to answer." };
  if (r.status !== "WAITING_PM") return { error: "We're updating this request. You'll get a new email shortly." };
  const reason = answer === "DENIED" ? reasonRaw?.trim().slice(0, 500) || null : null;
  const claimed = await prisma.subCoRequest.updateMany({
    where: { id: r.id, status: "WAITING_PM" },
    data: { status: answer, pmAnsweredAt: new Date(), pmDenyReason: reason },
  });
  if (!claimed.count) return { error: "This change order was just answered. Reload the page." };
  await prisma.subCoRequestEvent.create({
    data: { requestId: r.id, actor: "Property manager", text: answer === "APPROVED" ? "Approved" : reason ? `Denied: ${reason}` : "Denied" },
  });
  // Change order + emails; the answer itself is already saved
  await applySubCoAnswer(r.id, "The property manager").catch((e) => console.error("Sub CO answer follow-up failed", { id: r.id }, e));
  return { state: answer === "APPROVED" ? "approved" : "denied" };
}

/** A photo on the request, for the property manager's email and page. */
export async function getApprovalPhoto(token: string, photoId: string) {
  if (!isApprovalToken(token)) return null;
  return prisma.subCoRequestPhoto.findFirst({ where: { id: photoId, request: { pmToken: token } }, select: { data: true, mimeType: true } });
}

/** A reminder to the property managers about a request they haven't answered (subCoReminders.ts). */
export async function sendPmReminder(id: string, now: Date = new Date()): Promise<boolean> {
  const r = await loadRequest({ id });
  if (!r || r.status !== "WAITING_PM" || !r.pmToken || !appUrl()) return false;
  const managers = await propertyManagersFor(r.project.buildingId);
  if (!managers.length) return false;
  const contact = managers.find((m) => m.contact?.name || m.contact?.email)?.contact ?? null;
  const to = managers.map((m) => m.email);
  const result = await sendEmail({
    type: "SUB_CO_APPROVAL_REMINDER",
    to,
    replyTo: contact?.email ?? undefined,
    link: subCoRequestsPath(r.project.id),
    subject: `Reminder: change order for approval, ${unitName(r)}`,
    html: approvalEmailHtml(r, r.pmToken, false, contact, true),
  });
  if (result !== "SENT") return false;
  await prisma.$transaction([
    prisma.subCoRequest.update({ where: { id }, data: { pmRemindedAt: now, pmReminderCount: { increment: 1 } } }),
    prisma.subCoRequestEvent.create({ data: { requestId: id, actor: "Sueep", text: `Reminder emailed to the property manager (${to.join(", ")})` } }),
  ]);
  return true;
}
