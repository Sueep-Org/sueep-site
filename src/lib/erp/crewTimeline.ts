/** Pure helpers for the Timeline tab's "By crew" view: one row per worker,
 * showing which job they're on each day. No runtime imports, so it can be
 * unit tested directly with `node --test`. */

export type CrewKind = "SUPERVISOR" | "EMPLOYEE" | "CONTRACTOR" | "OTHER";

export const CREW_KIND_LABELS: Record<CrewKind, string> = {
  SUPERVISOR: "Supervisor",
  EMPLOYEE: "Employee",
  CONTRACTOR: "Sub",
  OTHER: "Other",
};

/** One worker on one job on one day. `logged` = labor was logged or the sub
 * engagement confirmed it; otherwise it's only planned. */
export type CrewDay = { projectId: string; dateKey: string; logged: boolean };

export type CrewPerson = { key: string; name: string; kind: CrewKind; days: CrewDay[] };

// A supervisor who is also on the employee list is one person, shown as a
// supervisor; the stronger label wins when the same key is registered twice.
const KIND_RANK: Record<CrewKind, number> = { SUPERVISOR: 3, CONTRACTOR: 2, EMPLOYEE: 1, OTHER: 0 };

/** Collects person-days from every source (logged labor, sub engagements,
 * planned crew, planned coverage), deduping the same person on the same job
 * on the same day. Logged beats planned when both exist. */
export function createCrewCollector() {
  const people = new Map<string, { name: string; kind: CrewKind; days: Map<string, CrewDay> }>();
  const keyByName = new Map<string, string>();

  return {
    person(key: string, name: string, kind: CrewKind) {
      const existing = people.get(key);
      if (!existing) {
        people.set(key, { name, kind, days: new Map() });
      } else if (KIND_RANK[kind] > KIND_RANK[existing.kind]) {
        existing.kind = kind;
        existing.name = name || existing.name;
      }
      const lower = name.trim().toLowerCase();
      if (lower && !keyByName.has(lower)) keyByName.set(lower, key);
    },
    /** Key for a name-only source (e.g. a labor entry with no employee
     * linked), matched case-insensitively to a known person, or registered
     * as a new "Other" person when nobody matches. */
    keyForName(name: string): string | null {
      const lower = name.trim().toLowerCase();
      if (!lower) return null;
      const known = keyByName.get(lower);
      if (known) return known;
      const key = `n:${lower}`;
      this.person(key, name.trim(), "OTHER");
      return key;
    },
    has(key: string) {
      return people.has(key);
    },
    add(key: string, projectId: string, dateKey: string, logged: boolean) {
      const p = people.get(key);
      if (!p) return;
      const k = `${projectId}|${dateKey}`;
      const prev = p.days.get(k);
      if (!prev || (logged && !prev.logged)) p.days.set(k, { projectId, dateKey, logged });
    },
    /** Everyone with at least one day, by name. */
    result(): CrewPerson[] {
      return Array.from(people.entries())
        .filter(([, p]) => p.days.size > 0)
        .map(([key, p]) => ({
          key,
          name: p.name,
          kind: p.kind,
          days: Array.from(p.days.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}

export type CrewSegment = {
  projectId: string;
  startKey: string;
  endKey: string;
  logged: boolean;
  /** Days actually on the job inside this block (weekends bridged over don't count). */
  dayCount: number;
  /** Stacking row inside the person's row, 0 = top. */
  lane: number;
};

function keyToTime(k: string): number {
  return Date.parse(`${k}T00:00:00.000Z`);
}

function nextKey(k: string, n = 1): string {
  return new Date(keyToTime(k) + n * 86400000).toISOString().slice(0, 10);
}

// True when every day strictly between a and b is a Saturday or Sunday, so a
// Friday-to-Monday run reads as one block instead of two.
function onlyWeekendBetween(a: string, b: string): boolean {
  for (let k = nextKey(a); k < b; k = nextKey(k)) {
    const wd = new Date(keyToTime(k)).getUTCDay();
    if (wd !== 0 && wd !== 6) return false;
  }
  return true;
}

/** Turns a person's days into blocks: same job, same logged/planned state,
 * consecutive days (bridging weekends). Overlapping blocks (double-booked
 * days) get stacked into separate lanes. */
export function crewSegments(days: CrewDay[]): { segments: CrewSegment[]; lanes: number; doubleBookedKeys: string[] } {
  const groups = new Map<string, CrewDay[]>();
  for (const d of days) {
    const g = `${d.projectId}|${d.logged ? 1 : 0}`;
    const list = groups.get(g) ?? [];
    list.push(d);
    groups.set(g, list);
  }

  const segments: CrewSegment[] = [];
  for (const list of groups.values()) {
    const sorted = Array.from(new Set(list.map((d) => d.dateKey))).sort();
    const { projectId, logged } = list[0]!;
    let start = sorted[0]!;
    let end = start;
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      const k = sorted[i]!;
      if (k === nextKey(end) || onlyWeekendBetween(end, k)) {
        end = k;
        count += 1;
      } else {
        segments.push({ projectId, startKey: start, endKey: end, logged, dayCount: count, lane: 0 });
        start = k;
        end = k;
        count = 1;
      }
    }
    segments.push({ projectId, startKey: start, endKey: end, logged, dayCount: count, lane: 0 });
  }

  segments.sort((a, b) => a.startKey.localeCompare(b.startKey) || a.endKey.localeCompare(b.endKey));
  const laneEnds: string[] = [];
  for (const s of segments) {
    let lane = laneEnds.findIndex((end) => end < s.startKey);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.endKey);
    } else {
      laneEnds[lane] = s.endKey;
    }
    s.lane = lane;
  }

  const projectsByDay = new Map<string, Set<string>>();
  for (const d of days) {
    const set = projectsByDay.get(d.dateKey) ?? new Set<string>();
    set.add(d.projectId);
    projectsByDay.set(d.dateKey, set);
  }
  const doubleBookedKeys = Array.from(projectsByDay.entries())
    .filter(([, set]) => set.size > 1)
    .map(([k]) => k)
    .sort();

  return { segments, lanes: Math.max(1, laneEnds.length), doubleBookedKeys };
}

/** Days booked from `fromKey` through the following `spanDays - 1` days, for
 * the "booked next 2 weeks" summary under each name. */
export function bookedDaysInWindow(days: CrewDay[], fromKey: string, spanDays: number): number {
  const toKey = nextKey(fromKey, spanDays - 1);
  return new Set(days.filter((d) => d.dateKey >= fromKey && d.dateKey <= toKey).map((d) => d.dateKey)).size;
}
