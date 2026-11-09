/**
 * Sign-in for the sub portal (/sub/[token]), the same way property manager
 * links work (propertyManagerAccess.ts): the link alone isn't enough. The
 * first time it's opened on a device we email the sub a 6-digit code, and
 * once it's entered that browser is remembered with a cookie
 * (ContractorPortalDevice). Server only.
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { buildSubPortalCodeEmail, buildSubPortalWelcomeEmail, sendEmail } from "@/lib/email";
import { parseLang, tr, type Lang } from "./language";

const CODE_MINUTES = 15;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const DEVICE_DAYS = 365;
const EMAIL_BUTTON_DAYS = 7;

export type LinkedSub = { id: string; name: string; email: string; lang: Lang };

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
}

export function subPortalUrl(token: string): string {
  return `${siteUrl()}/sub/${token}`;
}

function emailSignInUrl(token: string, key: string): string {
  return `${siteUrl()}/api/sub/${token}/email-sign-in?k=${encodeURIComponent(key)}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function codeHash(contractorId: string, code: string): string {
  return sha256(`sub:${contractorId}:${code}`);
}

/** One cookie per sub, so staff testing two links in one browser stay signed in to both. */
function deviceCookieName(contractorId: string): string {
  return `sueep_sub_${contractorId}`;
}

/** The sub a link belongs to, or null if the link is unknown or turned off, the sub is inactive, or has no email to sign in with. */
export async function findSubByToken(token: string): Promise<LinkedSub | null> {
  if (!token || token.length < 16) return null;
  const c = await prisma.contractor.findUnique({
    where: { portalToken: token },
    select: { id: true, name: true, email: true, status: true, language: true, portalTurnedOffAt: true },
  });
  if (!c || c.status !== "ACTIVE" || !c.email || c.portalTurnedOffAt) return null;
  return { id: c.id, name: c.name, email: c.email, lang: parseLang(c.language) };
}

/** True when this browser already signed in for this sub. Also stamps when they were last here. */
export async function isDeviceSignedIn(contractorId: string): Promise<boolean> {
  const value = (await cookies()).get(deviceCookieName(contractorId))?.value;
  if (!value) return false;
  const device = await prisma.contractorPortalDevice.findUnique({ where: { tokenHash: sha256(value) } });
  if (!device || device.contractorId !== contractorId) return false;
  const now = new Date();
  await prisma.$transaction([
    prisma.contractorPortalDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } }),
    prisma.contractor.update({ where: { id: contractorId }, data: { portalLastSeenAt: now } }),
  ]);
  return true;
}

export async function sendSignInCode(sub: LinkedSub): Promise<{ ok: true } | { error: string }> {
  const current = await prisma.contractor.findUnique({ where: { id: sub.id }, select: { portalCodeSentAt: true } });
  if (current?.portalCodeSentAt && Date.now() - current.portalCodeSentAt.getTime() < RESEND_SECONDS * 1000) {
    return { error: tr(sub.lang, { en: "A code was just sent. Wait a minute before asking for another.", es: "Acabamos de enviar un código. Espera un minuto antes de pedir otro." }) };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  await prisma.contractor.update({
    where: { id: sub.id },
    data: {
      portalCodeHash: codeHash(sub.id, code),
      portalCodeExpiresAt: new Date(now.getTime() + CODE_MINUTES * 60 * 1000),
      portalCodeSentAt: now,
      portalCodeAttempts: 0,
    },
  });
  if (process.env.NODE_ENV !== "production") console.log(`[sub sign-in] code for ${sub.email}: ${code}`);

  const result = await sendEmail({
    type: "SUB_PORTAL_SIGN_IN_CODE",
    to: sub.email,
    subject: tr(sub.lang, { en: `${code} is your Sueep sign-in code`, es: `${code} es tu código de Sueep` }),
    html: buildSubPortalCodeEmail({ firstName: sub.name.split(" ")[0] || sub.name, code, lang: sub.lang }),
    lang: sub.lang,
  });
  if (result === "NO_RECIPIENTS") return { error: tr(sub.lang, { en: "We couldn't send the code. Contact Sueep.", es: "No pudimos enviar el código. Contacta a Sueep." }) };
  return { ok: true };
}

/** Checks the code and, when right, remembers this browser. */
export async function verifySignInCode(sub: LinkedSub, code: string): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contractor.findUnique({
    where: { id: sub.id },
    select: { portalCodeHash: true, portalCodeExpiresAt: true, portalCodeAttempts: true },
  });
  if (!c?.portalCodeHash || !c.portalCodeExpiresAt || c.portalCodeExpiresAt < new Date()) {
    return { error: tr(sub.lang, { en: "That code expired. Send a new one.", es: "Ese código venció. Pide uno nuevo." }) };
  }
  if (c.portalCodeAttempts >= MAX_ATTEMPTS) {
    return { error: tr(sub.lang, { en: "Too many tries. Send a new code.", es: "Demasiados intentos. Pide un código nuevo." }) };
  }

  const given = Buffer.from(codeHash(sub.id, code.replace(/\D/g, "")));
  const expected = Buffer.from(c.portalCodeHash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    await prisma.contractor.update({ where: { id: sub.id }, data: { portalCodeAttempts: { increment: 1 } } });
    return { error: tr(sub.lang, { en: "That code isn't right. Check the email and try again.", es: "Ese código no es correcto. Revisa el correo e intenta de nuevo." }) };
  }

  await prisma.contractor.update({
    where: { id: sub.id },
    data: { portalCodeHash: null, portalCodeExpiresAt: null, portalCodeAttempts: 0 },
  });
  await rememberDevice(sub.id);
  return { ok: true };
}

/** Signs this browser in for the sub with a cookie. Route handlers only. */
async function rememberDevice(contractorId: string): Promise<void> {
  const deviceToken = randomBytes(32).toString("base64url");
  const userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await prisma.$transaction([
    prisma.contractor.update({ where: { id: contractorId }, data: { portalLastSeenAt: new Date() } }),
    prisma.contractorPortalDevice.create({ data: { contractorId, tokenHash: sha256(deviceToken), userAgent } }),
  ]);
  (await cookies()).set(deviceCookieName(contractorId), deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_DAYS * 24 * 60 * 60,
  });
}

/**
 * A fresh "Open my Sueep page" button URL for an email to this sub, or null
 * when they have no portal. Only they get the email, so the button signs
 * them in without a code. Works for a week, and more than once, since mail
 * scanners often open links before people do.
 */
export async function subEmailButtonUrl(contractorId: string): Promise<string | null> {
  const c = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { portalToken: true, status: true, portalTurnedOffAt: true } });
  if (!c?.portalToken || c.status !== "ACTIVE" || c.portalTurnedOffAt) return null;
  const key = randomBytes(24).toString("base64url");
  await prisma.$transaction([
    prisma.contractorPortalSignInLink.deleteMany({ where: { contractorId, expiresAt: { lt: new Date() } } }),
    prisma.contractorPortalSignInLink.create({
      data: { contractorId, tokenHash: sha256(key), expiresAt: new Date(Date.now() + EMAIL_BUTTON_DAYS * 864e5) },
    }),
  ]);
  return emailSignInUrl(c.portalToken, key);
}

/** subEmailButtonUrl for whoever has this email, for schedule invites (which only know the address). Null for employees and subs without a portal. */
export async function subEmailButtonUrlForEmail(email: string): Promise<string | null> {
  const c = await prisma.contractor.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" }, portalToken: { not: null }, portalTurnedOffAt: null },
    select: { id: true },
  });
  return c ? subEmailButtonUrl(c.id) : null;
}

/** The email button's landing: signs this browser in when the key is good. Either way they go on to their page. */
export async function signInFromEmail(token: string, key: string): Promise<void> {
  const sub = await findSubByToken(token);
  if (!sub || !key) return;
  if (await isDeviceSignedIn(sub.id)) return;
  const link = await prisma.contractorPortalSignInLink.findUnique({ where: { tokenHash: sha256(key) } });
  if (!link || link.contractorId !== sub.id || link.expiresAt < new Date()) return;
  await rememberDevice(sub.id);
}

/** Forgets this browser for this sub. */
export async function signOutDevice(contractorId: string): Promise<void> {
  const store = await cookies();
  const value = store.get(deviceCookieName(contractorId))?.value;
  if (value) await prisma.contractorPortalDevice.deleteMany({ where: { tokenHash: sha256(value), contractorId } });
  store.delete(deviceCookieName(contractorId));
}

/**
 * Gives the sub a portal link, or a new one when `replace` is set. A new
 * link signs out every device and kills old email buttons, so the old link
 * stops working at once.
 */
export async function ensurePortalToken(contractorId: string, replace: boolean): Promise<string> {
  const c = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { portalToken: true } });
  if (c?.portalToken && !replace) return c.portalToken;
  const token = randomBytes(18).toString("base64url");
  await prisma.$transaction([
    prisma.contractorPortalDevice.deleteMany({ where: { contractorId } }),
    prisma.contractorPortalSignInLink.deleteMany({ where: { contractorId } }),
    prisma.contractor.update({
      where: { id: contractorId },
      data: { portalToken: token, portalCodeHash: null, portalCodeExpiresAt: null, portalCodeAttempts: 0 },
    }),
  ]);
  return token;
}

/** Emails a sub their portal, with plain steps and a sign-in button. */
export async function sendPortalWelcomeEmail(contractorId: string): Promise<{ ok: true } | { error: string }> {
  const c = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { name: true, email: true, status: true, language: true, portalTurnedOffAt: true } });
  if (!c) return { error: "Not found" };
  if (!c.email) return { error: "Add an email address first" };
  if (c.status !== "ACTIVE") return { error: "This contractor is inactive" };
  if (c.portalTurnedOffAt) return { error: "Their page is turned off. Turn it back on from the Users page." };
  await ensurePortalToken(contractorId, false);
  const url = await subEmailButtonUrl(contractorId);
  if (!url) return { error: "Couldn't make their link" };
  const lang = parseLang(c.language);
  const result = await sendEmail({
    type: "SUB_PORTAL_WELCOME",
    to: c.email,
    link: `/erp/contractors/${contractorId}`,
    subject: tr(lang, { en: "Your Sueep jobs page", es: "Tu página de trabajos de Sueep" }),
    html: buildSubPortalWelcomeEmail({ firstName: c.name.split(" ")[0] || c.name, url, lang }),
    lang,
  });
  if (result === "NO_RECIPIENTS") return { error: "They have no email" };
  return { ok: true };
}

/** For the portal's API routes: the sub, only if the link works and this browser is signed in. */
export async function requireSignedInSub(token: string): Promise<{ sub: LinkedSub } | { error: string; status: number }> {
  const sub = await findSubByToken(token);
  if (!sub) return { error: "This link doesn't work anymore. Contact Sueep for a new one.", status: 404 };
  if (!(await isDeviceSignedIn(sub.id))) {
    return { error: tr(sub.lang, { en: "You've been signed out. Refresh the page to sign in again.", es: "Se cerró tu sesión. Recarga la página para entrar de nuevo." }), status: 401 };
  }
  return { sub };
}
