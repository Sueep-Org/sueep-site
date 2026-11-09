/**
 * Where a sub's before/after photo was taken (SubJobPhoto.area). Turnovers
 * pick a turnover checklist section, so the photos line up with the unit
 * checklist; other jobs type a few words. Client-safe.
 */
import { UNIT_CHECKLIST_SECTIONS } from "./unitTurnoverChecklistTemplate";

export type PhotoKind = "before" | "after";

export const TURNOVER_PHOTO_AREAS: { id: string; label: string }[] = UNIT_CHECKLIST_SECTIONS.map((s) => ({
  id: s.id,
  label: s.title.replace(/^\d+\.\s*/, ""),
}));

const LABEL_BY_ID = new Map(TURNOVER_PHOTO_AREAS.map((a) => [a.id, a.label]));

export const MAX_AREA_LENGTH = 60;

/** A stored area for people to read: the checklist section's name, or what they typed */
export function photoAreaLabel(area: string | null | undefined): string | null {
  if (!area) return null;
  return LABEL_BY_ID.get(area) ?? area;
}

/** Cleans an area from the phone: a known section id on turnovers, short free text otherwise */
export function parsePhotoArea(v: unknown, turnover: boolean): string | null {
  const text = typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, MAX_AREA_LENGTH) : "";
  if (!text) return null;
  if (turnover) return LABEL_BY_ID.has(text) ? text : null;
  return text;
}
