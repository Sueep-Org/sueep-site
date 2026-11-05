/**
 * Dropdown lists staff can edit on the Settings page (Lists tab): add, rename,
 * hide, reorder. Hidden items stay so old records still show their label.
 * Client-safe. Servers read with loadAppLists (appListsServer.ts); ERP pages
 * in the browser with useAppLists.
 */

export type ListItem = { value: string; label: string; hidden?: boolean };

export const APP_LIST_IDS = ["serviceTypes", "removalReasons", "hiringSources", "janitorialRoles"] as const;
export type AppListId = (typeof APP_LIST_IDS)[number];
export type AppLists = Record<AppListId, ListItem[]>;

/** Name and help for each list on the Lists tab. `locked` items can be renamed but not hidden (code depends on them). */
export const APP_LIST_INFO: Record<AppListId, { label: string; info: string; locked?: string[] }> = {
  serviceTypes: { label: "Service types", info: "The Service type choices on New Project and the job brief." },
  removalReasons: {
    label: "Why a schedule day was removed",
    info: "Asked when a planned day or change order day is taken off the schedule. Placed by mistake deletes the day, every other reason leaves a gray chip.",
    locked: ["MISTAKE"],
  },
  hiringSources: { label: "Hiring sources", info: "Where an office candidate or job posting came from, on the Candidates page." },
  janitorialRoles: { label: "Janitorial price calculator roles", info: "Role suggestions in a janitorial contract's price calculator. Any role can still be typed." },
};

const items = (labels: string[]): ListItem[] => labels.map((l) => ({ value: l, label: l }));

export const DEFAULT_APP_LISTS: AppLists = {
  serviceTypes: items(["Final Cleaning", "Pre-Final Cleaning", "Powder Puff Cleaning", "Turnover Cleaning", "UDR", "Pool", "Grill Cleaning", "Painting", "Carpet Cleaning", "Caulking"]),
  removalReasons: [
    { value: "MISTAKE", label: "Placed by mistake / wrong day" },
    { value: "RESCHEDULED", label: "Rescheduled" },
    { value: "CLIENT_CANCELED", label: "Client canceled" },
    { value: "WEATHER", label: "Weather" },
    { value: "CREW_UNAVAILABLE", label: "Crew unavailable" },
    { value: "SITE_NOT_READY", label: "Site not ready / no access" },
    { value: "OTHER", label: "Other" },
  ],
  hiringSources: [
    { value: "LINKEDIN", label: "LinkedIn" },
    { value: "INDEED", label: "Indeed" },
    { value: "REFERRAL", label: "Referral" },
    { value: "WEBSITE", label: "Website" },
    { value: "OTHER", label: "Other" },
  ],
  janitorialRoles: items(["Janitorial", "Cleaner", "Porter", "Foreman", "Supervisor", "Concierge", "Patrol"]),
};

/** Items to offer in a picker. */
export function shownItems(list: ListItem[]): ListItem[] {
  return list.filter((i) => !i.hidden);
}

/** The label for a stored value, hidden items included, else the value itself. */
export function listLabel(list: ListItem[], value: string | null | undefined, fallback = "-"): string {
  if (!value) return fallback;
  return list.find((i) => i.value === value)?.label ?? value;
}

/** Checks a list posted from the Lists tab. New items get their label as value. */
export function readList(id: AppListId, input: unknown): ListItem[] | null {
  if (!Array.isArray(input) || input.length > 100) return null;
  const out: ListItem[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const label = String(r.label ?? "").trim().slice(0, 120);
    if (!label) continue;
    const value = (String(r.value ?? "").trim() || label).slice(0, 120);
    if (seen.has(value)) continue;
    seen.add(value);
    const locked = APP_LIST_INFO[id].locked?.includes(value);
    out.push({ value, label, ...(r.hidden === true && !locked ? { hidden: true } : {}) });
  }
  for (const v of APP_LIST_INFO[id].locked ?? []) {
    if (!seen.has(v)) out.unshift(DEFAULT_APP_LISTS[id].find((i) => i.value === v)!);
  }
  return out.length ? out : null;
}
