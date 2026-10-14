import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LAYOUT_PREFS, isCardTab, type CardTab, type DashboardLayoutPrefs } from "./dashboardCards";

/** Card ids and tab ids are short kebab/lowercase words. */
const ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const MAX_IDS = 100;

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const v of value) {
    if (typeof v === "string" && ID_PATTERN.test(v)) out.add(v);
    if (out.size >= MAX_IDS) break;
  }
  return [...out];
}

function cleanCardOrder(value: unknown): Partial<Record<CardTab, string[]>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Partial<Record<CardTab, string[]>> = {};
  for (const [tab, ids] of Object.entries(value)) {
    if (isCardTab(tab)) out[tab] = cleanIds(ids);
  }
  return out;
}

function cleanStartTab(value: unknown): string | null {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : null;
}

/** Turns whatever is stored (or sent) into a safe layout. Bad parts fall back to the default. */
export function cleanLayoutPrefs(raw: { hiddenCards?: unknown; cardOrder?: unknown; startTab?: unknown } | null | undefined): DashboardLayoutPrefs {
  if (!raw) return DEFAULT_LAYOUT_PREFS;
  return {
    hiddenCards: cleanIds(raw.hiddenCards),
    cardOrder: cleanCardOrder(raw.cardOrder),
    startTab: cleanStartTab(raw.startTab),
  };
}

function key(email: string): string {
  return email.trim().toLowerCase();
}

export async function loadDashboardPrefs(email: string): Promise<DashboardLayoutPrefs> {
  if (!email) return DEFAULT_LAYOUT_PREFS;
  const row = await prisma.dashboardPreference.findUnique({
    where: { userEmail: key(email) },
    select: { hiddenCards: true, cardOrder: true, startTab: true },
  });
  return cleanLayoutPrefs(row);
}

/** Saves only the fields present in `input`; the rest keep their saved values. */
export async function saveDashboardPrefs(
  email: string,
  input: { hiddenCards?: unknown; cardOrder?: unknown; startTab?: unknown },
): Promise<DashboardLayoutPrefs> {
  const data: { hiddenCards?: string[]; cardOrder?: Partial<Record<CardTab, string[]>>; startTab?: string | null } = {};
  if ("hiddenCards" in input) data.hiddenCards = cleanIds(input.hiddenCards);
  if ("cardOrder" in input) data.cardOrder = cleanCardOrder(input.cardOrder);
  if ("startTab" in input) data.startTab = cleanStartTab(input.startTab);

  const row = await prisma.dashboardPreference.upsert({
    where: { userEmail: key(email) },
    create: { userEmail: key(email), ...data },
    update: data,
    select: { hiddenCards: true, cardOrder: true, startTab: true },
  });
  return cleanLayoutPrefs(row);
}

/** Back to the role default layout. Keeps the last-visit times. */
export async function resetDashboardPrefs(email: string): Promise<DashboardLayoutPrefs> {
  await prisma.dashboardPreference.updateMany({
    where: { userEmail: key(email) },
    data: { hiddenCards: [], cardOrder: Prisma.DbNull, startTab: null },
  });
  return DEFAULT_LAYOUT_PREFS;
}
