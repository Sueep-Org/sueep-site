/** Pure date helpers for ERP schedule / Gantt (no external deps). */

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function monthMatrix(anchor: Date): Date[][] {
  const first = startOfMonth(anchor);
  const startWeekday = first.getDay();
  const dim = endOfMonth(anchor).getDate();
  const cells: Date[] = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push(addDays(first, i - startWeekday));
  }
  for (let day = 1; day <= dim; day++) {
    cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]!;
    cells.push(addDays(last, 1));
  }
  const rows: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

const DEFAULT_SPAN_DAYS = 14;

export type ScheduleProject = {
  id: string;
  jobTitle: string;
  segment: string;
  status: string;
  projectDate: string | null;
  projectEndDate: string | null;
  createdAt: string;
  percentDone: number;
  supervisorUserId: string | null;
  /** Day keys (YYYY-MM-DD) this project actually has logged labor on. */
  workDayKeys: string[];
};

/** A ProjectChangeOrder (CO), shown on the month calendar separately from
 * its parent project — driven by its estimated start date plus any days its
 * own laborers have logged work. */
export type ScheduleChangeOrder = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  workDayKeys: string[];
};

/** A planned supervisor coverage of a project on a future day (before any
 * labor has actually been logged for it). */
export type ScheduleDayAssignment = {
  id: string;
  projectId: string;
  /** Day key (YYYY-MM-DD) this assignment is for. */
  dateKey: string;
  supervisorUserId: string;
};

export function projectWindow(p: ScheduleProject): { start: Date; end: Date } {
  const created = new Date(p.createdAt);
  const start = p.projectDate ? new Date(p.projectDate) : startOfDay(created);
  let end: Date;
  if (p.projectEndDate) {
    end = startOfDay(new Date(p.projectEndDate));
    if (end < start) end = start;
  } else {
    end = addDays(start, DEFAULT_SPAN_DAYS);
  }
  return { start: startOfDay(start), end };
}

export function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}
