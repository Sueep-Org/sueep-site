/**
 * End-of-day wrap-up (subWrapUps.ts), plain data safe in the browser.
 */

export type WrapUpItem = { label: string; done: boolean; reason: string | null };

/** The one task when a day has no SOV lines, scope items or checklist */
export const WHOLE_DAY_TASK = "The work scheduled for this day";

export const WRAP_UP_REASON_MIN = 3;
export const WRAP_UP_REASON_MAX = 500;
export const WRAP_UP_NOTE_MAX = 1000;
/** How many days back a sub can still send a wrap-up */
export const WRAP_UP_DAYS_BACK = 3;

/** A day waiting on the sub's wrap-up, for the portal */
export type PortalWrapUp = {
  jobKey: string;
  dateKey: string;
  title: string;
  tasks: string[];
};

/** A sent wrap-up, for the ERP's day card and review page */
export type WrapUpSummary = {
  at: string;
  items: WrapUpItem[];
  note: string | null;
  notDone: number;
};

export function parseWrapUpItems(raw: unknown): WrapUpItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) =>
    r && typeof r === "object" && typeof (r as WrapUpItem).label === "string"
      ? [{ label: (r as WrapUpItem).label, done: (r as WrapUpItem).done === true, reason: typeof (r as WrapUpItem).reason === "string" ? (r as WrapUpItem).reason : null }]
      : [],
  );
}

export function wrapUpSummary(row: { wrapUpAt: Date | null; wrapUpItems: unknown; wrapUpNote: string | null }): WrapUpSummary | null {
  if (!row.wrapUpAt) return null;
  const items = parseWrapUpItems(row.wrapUpItems);
  return { at: row.wrapUpAt.toISOString(), items, note: row.wrapUpNote, notDone: items.filter((i) => !i.done).length };
}
