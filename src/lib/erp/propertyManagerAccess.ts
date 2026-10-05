/**
 * Sign-in for property manager links (/pm/[token]). The link alone isn't
 * enough: the first time it's opened on a device we email a 6-digit code to
 * the property manager, and once it's entered that browser is remembered
 * with a cookie (PropertyManagerDevice). Server only.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { buildPropertyManagerCodeEmail, buildPropertyManagerWelcomeEmail, sendEmail, type SueepContact } from "@/lib/email";
import { propertyManagerEmailSignInUrl } from "./propertyManagers";

const CODE_MINUTES = 15;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const DEVICE_DAYS = 365;
const EMAIL_BUTTON_DAYS = 7;

export type LinkedManager = { id: string; name: string; email: string };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function codeHash(managerId: string, code: string): string {
  return sha256(`${managerId}:${code}`);
}

/** One cookie per property manager, so staff testing two links in one browser stay signed in to both. */
function deviceCookieName(managerId: string): string {
  return `sueep_pm_${managerId}`;
}

/** The property manager a link belongs to, or null if the link is unknown or turned off. */
export async function findManagerByToken(token: string): Promise<LinkedManager | null> {
  if (!token || token.length < 16) return null;
  const pm = await prisma.propertyManager.findUnique({
    where: { token },
    select: { id: true, name: true, email: true, active: true },
  });
  return pm?.active ? { id: pm.id, name: pm.name, email: pm.email } : null;
}

/** True when this browser already signed in for this property manager. Also stamps when they were last here. */
export async function isDeviceSignedIn(managerId: string): Promise<boolean> {
  const value = (await cookies()).get(deviceCookieName(managerId))?.value;
  if (!value) return false;
  const device = await prisma.propertyManagerDevice.findUnique({ where: { tokenHash: sha256(value) } });
  if (!device || device.propertyManagerId !== managerId) return false;
  const now = new Date();
  await prisma.$transaction([
    prisma.propertyManagerDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } }),
    prisma.propertyManager.update({ where: { id: managerId }, data: { lastSeenAt: now } }),
  ]);
  return true;
}

/** "d***@company.com", so the page can say where the code went without showing the whole address. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}***@${domain ?? ""}`;
}

export async function sendSignInCode(manager: LinkedManager): Promise<{ ok: true } | { error: string }> {
  const current = await prisma.propertyManager.findUnique({ where: { id: manager.id }, select: { signInCodeSentAt: true } });
  if (current?.signInCodeSentAt && Date.now() - current.signInCodeSentAt.getTime() < RESEND_SECONDS * 1000) {
    return { error: "A code was just sent. Wait a minute before asking for another." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  await prisma.propertyManager.update({
    where: { id: manager.id },
    data: {
      signInCodeHash: codeHash(manager.id, code),
      signInCodeExpiresAt: new Date(now.getTime() + CODE_MINUTES * 60 * 1000),
      signInCodeSentAt: now,
      signInCodeAttempts: 0,
    },
  });
  if (process.env.NODE_ENV !== "production") console.log(`[pm sign-in] code for ${manager.email}: ${code}`);

  const result = await sendEmail({
    type: "PROPERTY_MANAGER_SIGN_IN_CODE",
    to: manager.email,
    subject: `${code} is your Sueep sign-in code`,
    html: buildPropertyManagerCodeEmail({ firstName: manager.name.split(" ")[0] || manager.name, code }),
  });
  if (result === "NO_RECIPIENTS") return { error: "We couldn't send the code. Contact Sueep." };
  return { ok: true };
}

/** Checks the code and, when right, remembers this browser. */
export async function verifySignInCode(manager: LinkedManager, code: string): Promise<{ ok: true } | { error: string }> {
  const pm = await prisma.propertyManager.findUnique({
    where: { id: manager.id },
    select: { signInCodeHash: true, signInCodeExpiresAt: true, signInCodeAttempts: true },
  });
  if (!pm?.signInCodeHash || !pm.signInCodeExpiresAt || pm.signInCodeExpiresAt < new Date()) {
    return { error: "That code expired. Send a new one." };
  }
  if (pm.signInCodeAttempts >= MAX_ATTEMPTS) {
    return { error: "Too many tries. Send a new code." };
  }

  const given = Buffer.from(codeHash(manager.id, code.replace(/\D/g, "")));
  const expected = Buffer.from(pm.signInCodeHash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    await prisma.propertyManager.update({ where: { id: manager.id }, data: { signInCodeAttempts: { increment: 1 } } });
    return { error: "That code isn't right. Check the email and try again." };
  }

  await prisma.propertyManager.update({
    where: { id: manager.id },
    data: { signInCodeHash: null, signInCodeExpiresAt: null, signInCodeAttempts: 0 },
  });
  await rememberDevice(manager.id);
  return { ok: true };
}

/** Signs this browser in for the property manager with a cookie. Route handlers only. */
async function rememberDevice(managerId: string): Promise<void> {
  const deviceToken = randomBytes(32).toString("base64url");
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await prisma.$transaction([
    prisma.propertyManager.update({ where: { id: managerId }, data: { lastSeenAt: new Date() } }),
    prisma.propertyManagerDevice.create({ data: { propertyManagerId: managerId, tokenHash: sha256(deviceToken), userAgent } }),
  ]);
  (await cookies()).set(deviceCookieName(managerId), deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_DAYS * 24 * 60 * 60,
  });
}

/**
 * A fresh "See my turnovers" button URL for an email to this property
 * manager, or null when their link is off. Only they get the email, so the
 * button can sign them in without a code. It works for a week, and more
 * than once, since mail scanners often open links before people do.
 */
export async function emailButtonUrl(managerId: string): Promise<string | null> {
  const pm = await prisma.propertyManager.findUnique({ where: { id: managerId }, select: { token: true, active: true } });
  if (!pm?.active) return null;
  const key = randomBytes(24).toString("base64url");
  await prisma.$transaction([
    prisma.propertyManagerSignInLink.deleteMany({ where: { propertyManagerId: managerId, expiresAt: { lt: new Date() } } }),
    prisma.propertyManagerSignInLink.create({
      data: { propertyManagerId: managerId, tokenHash: sha256(key), expiresAt: new Date(Date.now() + EMAIL_BUTTON_DAYS * 864e5) },
    }),
  ]);
  return propertyManagerEmailSignInUrl(pm.token, key);
}

/** The sign-in button and Sueep contact for an email to a property manager. Both null when there's no one (e.g. a website request from someone without a link). */
export async function emailExtrasFor(managerId: string | null): Promise<{ url: string | null; contact: SueepContact | null }> {
  if (!managerId) return { url: null, contact: null };
  const pm = await prisma.propertyManager.findUnique({
    where: { id: managerId },
    select: { sueepContactName: true, sueepContactPhone: true, sueepContactEmail: true },
  });
  if (!pm) return { url: null, contact: null };
  return {
    url: await emailButtonUrl(managerId),
    contact: { name: pm.sueepContactName, phone: pm.sueepContactPhone, email: pm.sueepContactEmail },
  };
}

/** The email button's landing: signs this browser in when the key is good. Either way they go on to their page. */
export async function signInFromEmail(token: string, key: string): Promise<void> {
  const manager = await findManagerByToken(token);
  if (!manager || !key) return;
  if (await isDeviceSignedIn(manager.id)) return;
  const link = await prisma.propertyManagerSignInLink.findUnique({ where: { tokenHash: sha256(key) } });
  if (!link || link.propertyManagerId !== manager.id || link.expiresAt < new Date()) return;
  await rememberDevice(manager.id);
}

/** Forgets this browser for this property manager. */
export async function signOutDevice(managerId: string): Promise<void> {
  const store = await cookies();
  const value = store.get(deviceCookieName(managerId))?.value;
  if (value) await prisma.propertyManagerDevice.deleteMany({ where: { tokenHash: sha256(value), propertyManagerId: managerId } });
  store.delete(deviceCookieName(managerId));
}

/** For the link's API routes: the property manager, only if the link works and this browser is signed in. */
export async function requireSignedInManager(token: string): Promise<{ manager: LinkedManager } | { error: string; status: number }> {
  const manager = await findManagerByToken(token);
  if (!manager) return { error: "This link doesn't work anymore. Contact Sueep for a new one.", status: 404 };
  if (!(await isDeviceSignedIn(manager.id))) return { error: "You've been signed out. Refresh the page to sign in again.", status: 401 };
  return { manager };
}

/** Emails a property manager their page, with plain steps and a sign-in button. */
export async function sendWelcomeEmail(managerId: string): Promise<{ ok: true } | { error: string }> {
  const pm = await prisma.propertyManager.findUnique({
    where: { id: managerId },
    select: { name: true, email: true, active: true, buildings: { select: { building: { select: { name: true } } }, orderBy: { building: { name: "asc" } } } },
  });
  if (!pm) return { error: "Not found" };
  if (!pm.active) return { error: "Turn their link on first" };
  if (!pm.buildings.length) return { error: "Give them at least one building first" };
  const { url, contact } = await emailExtrasFor(managerId);
  if (!url) return { error: "Turn their link on first" };
  const result = await sendEmail({
    type: "PROPERTY_MANAGER_WELCOME",
    to: pm.email,
    link: "/erp/property-managers",
    subject: "Your Sueep turnover page",
    html: buildPropertyManagerWelcomeEmail({
      firstName: pm.name.split(" ")[0] || pm.name,
      buildings: pm.buildings.map((b) => b.building.name),
      url,
      contact,
    }),
  });
  if (result === "NO_RECIPIENTS") return { error: "They have no email" };
  return { ok: true };
}
