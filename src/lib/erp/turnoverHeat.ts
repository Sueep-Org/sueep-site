/** Pure helpers for the Timeline tab's "Turnovers" view: one row per
 * property, one cell per week, shaded by how many turnover units there are
 * being worked that week. No runtime imports, so it can be unit tested
 * directly with `node --test`. */

export type HeatUnit = {
  id: string;
  title: string;
  /** Building id, or a shared key for units with no building linked. */
  buildingKey: string;
  buildingName: string;
  done: boolean;
  /** Every day this unit is on the schedule: logged, planned, or (when it
   * has neither) just its start date. */
  dayKeys: string[];
};

export type HeatWeek = { weekKey: string; unitIds: string[]; doneCount: number };

export type HeatRow = {
  buildingKey: string;
  buildingName: string;
  /** Units with at least one day in the window. */
  unitCount: number;
  openCount: number;
  weeks: HeatWeek[];
};

export const NO_BUILDING_KEY = "__none__";

function keyToTime(k: string): number {
  return Date.parse(`${k}T00:00:00.000Z`);
}

/** Monday of the week a day falls in. */
export function weekStartKey(k: string): string {
  const t = keyToTime(k);
  const wd = new Date(t).getUTCDay(); // 0 = Sunday
  const back = (wd + 6) % 7;
  return new Date(t - back * 86400000).toISOString().slice(0, 10);
}

/** Groups units by building and week, counting each unit once per week no
 * matter how many of its days fall in it. Only days from fromKey through
 * toKey count. Busiest buildings (most open units) first. */
export function buildTurnoverHeat(units: HeatUnit[], fromKey: string, toKey: string): HeatRow[] {
  const rows = new Map<string, { name: string; units: Set<string>; open: Set<string>; weeks: Map<string, Set<string>>; done: Set<string> }>();
  for (const u of units) {
    const days = u.dayKeys.filter((k) => k >= fromKey && k <= toKey);
    if (days.length === 0) continue;
    let row = rows.get(u.buildingKey);
    if (!row) {
      row = { name: u.buildingName, units: new Set(), open: new Set(), weeks: new Map(), done: new Set() };
      rows.set(u.buildingKey, row);
    }
    row.units.add(u.id);
    if (u.done) row.done.add(u.id);
    else row.open.add(u.id);
    for (const k of days) {
      const w = weekStartKey(k);
      const set = row.weeks.get(w) ?? new Set<string>();
      set.add(u.id);
      row.weeks.set(w, set);
    }
  }
  return Array.from(rows.entries())
    .map(([buildingKey, r]) => ({
      buildingKey,
      buildingName: r.name,
      unitCount: r.units.size,
      openCount: r.open.size,
      weeks: Array.from(r.weeks.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekKey, ids]) => ({
          weekKey,
          unitIds: Array.from(ids),
          doneCount: Array.from(ids).filter((id) => r.done.has(id)).length,
        })),
    }))
    .sort((a, b) => b.openCount - a.openCount || a.buildingName.localeCompare(b.buildingName));
}

/** Shade step for a week's unit count: 0 (none) up to 4 (7 or more). */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}
