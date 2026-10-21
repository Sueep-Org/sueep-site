import { prisma } from "@/lib/prisma";
import { parseLang, type Lang } from "./language";

/**
 * Language for each email address, from the employee or contractor with that
 * email (lowercased keys). Addresses that aren't a worker get English.
 */
export async function languagesForEmails(emails: string[]): Promise<Map<string, Lang>> {
  const keys = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const out = new Map<string, Lang>(keys.map((k) => [k, "en"]));
  if (!keys.length) return out;
  const where = { OR: keys.map((k) => ({ email: { equals: k, mode: "insensitive" as const } })) };
  const [employees, contractors] = await Promise.all([
    prisma.employee.findMany({ where, select: { email: true, language: true } }),
    prisma.contractor.findMany({ where, select: { email: true, language: true } }),
  ]);
  // Spanish wins if the same email is on both an employee and a contractor set to Spanish
  for (const r of [...employees, ...contractors]) {
    if (r.email && parseLang(r.language) === "es") out.set(r.email.toLowerCase(), "es");
  }
  return out;
}

export async function languageForEmail(email: string | null | undefined): Promise<Lang> {
  if (!email) return "en";
  return (await languagesForEmails([email])).get(email.trim().toLowerCase()) ?? "en";
}
