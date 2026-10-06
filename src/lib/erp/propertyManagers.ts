/**
 * Outside property managers and their private turnover links (/pm/[token]).
 * Each one sees only the buildings staff assign them on the Property
 * Managers page, with no ERP login.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
}

export function propertyManagerLinkUrl(token: string): string {
  return `${siteUrl()}/pm/${token}`;
}

/** The button in our emails: signs them in on the way to their page, see signInFromEmail. */
export function propertyManagerEmailSignInUrl(token: string, key: string): string {
  return `${siteUrl()}/api/pm/${token}/email-sign-in?k=${encodeURIComponent(key)}`;
}

export function newPropertyManagerToken(): string {
  return randomBytes(18).toString("base64url");
}

export type PropertyManagerInput = {
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  weeklyEmail: boolean;
  sueepContactName: string | null;
  sueepContactPhone: string | null;
  sueepContactEmail: string | null;
  buildingIds: string[];
};

function text(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates the add/edit form. Buildings that don't exist are dropped. */
export async function parsePropertyManagerBody(
  body: Record<string, unknown>,
): Promise<{ data: PropertyManagerInput } | { error: string }> {
  const name = text(body.name);
  if (!name) return { error: "Name is required" };
  const email = text(body.email)?.toLowerCase() ?? null;
  if (!email || !EMAIL_RE.test(email)) return { error: "A valid email is required" };

  const requested = Array.isArray(body.buildingIds)
    ? [...new Set(body.buildingIds.filter((id): id is string => typeof id === "string"))]
    : [];
  const buildings = requested.length
    ? await prisma.building.findMany({ where: { id: { in: requested } }, select: { id: true } })
    : [];

  return {
    data: {
      name,
      company: text(body.company),
      email,
      phone: text(body.phone, 50),
      notes: text(body.notes, 2000),
      active: body.active !== false,
      weeklyEmail: body.weeklyEmail !== false,
      sueepContactName: text(body.sueepContactName),
      sueepContactPhone: text(body.sueepContactPhone, 50),
      sueepContactEmail: text(body.sueepContactEmail)?.toLowerCase() ?? null,
      buildingIds: buildings.map((b) => b.id),
    },
  };
}

/** Starting Sueep contact for a new property manager. Name and phone come
 * from their Employee profile, so a changed number shows up here too. */
export const DEFAULT_SUEEP_CONTACT_EMAIL = "nick@sueep.com";

/** Nick Wehr as the starting Sueep contact for a new property manager, or
 * the signed-in staff member if his employee profile can't be found. */
export async function defaultSueepContact(staffEmail: string): Promise<{ name: string; phone: string; email: string }> {
  for (const email of [DEFAULT_SUEEP_CONTACT_EMAIL, staffEmail]) {
    const employee = await prisma.employee.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { firstName: true, lastName: true, phone: true },
    });
    if (employee) {
      return { name: `${employee.firstName} ${employee.lastName}`.trim(), phone: employee.phone ?? "", email: email.toLowerCase() };
    }
  }
  return { name: "", phone: "", email: staffEmail.toLowerCase() };
}
