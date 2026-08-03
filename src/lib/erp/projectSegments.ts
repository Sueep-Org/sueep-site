export const PROJECT_SEGMENTS = [
    "COMMERCIAL_PAINTING",
    "COMMERCIAL_CLEANING",
    "CHANGE_ORDER",
    "JANITORIAL_TURNOVER_REQUESTS",
    "REAL_ESTATE",
    "OTHER",
  ] as const;
  
  export type ProjectSegment = (typeof PROJECT_SEGMENTS)[number];
  
  const LEGACY_SEGMENT_MAP: Record<string, ProjectSegment> = {
    COMMERCIAL: "COMMERCIAL_CLEANING",
  };
  
  const SEGMENT_LABELS: Record<ProjectSegment, string> = {
    COMMERCIAL_PAINTING: "Commercial painting",
    COMMERCIAL_CLEANING: "Commercial cleaning",
    CHANGE_ORDER: "Change order",
    JANITORIAL_TURNOVER_REQUESTS: "Janitorial turnover requests",
    REAL_ESTATE: "Real estate",
    OTHER: "Other",
  };
  
  export const PROJECT_SEGMENT_OPTIONS = PROJECT_SEGMENTS.map((value) => ({
    value,
    label: SEGMENT_LABELS[value],
  }));
  
  export function normalizeProjectSegment(raw: string | null | undefined): ProjectSegment {
    const v = (raw || "").trim().toUpperCase();
    if (PROJECT_SEGMENTS.includes(v as ProjectSegment)) return v as ProjectSegment;
    if (LEGACY_SEGMENT_MAP[v]) return LEGACY_SEGMENT_MAP[v];
    return "OTHER";
  }
  
  export function projectSegmentLabel(raw: string | null | undefined): string {
    const normalized = normalizeProjectSegment(raw);
    return SEGMENT_LABELS[normalized];
  }

  // Groups the finer-grained segments above into the four buckets the
  // Schedule calendar (and the day-assignment modal) actually cares about —
  // painting/cleaning are both "Post-construction" for scheduling purposes.
  export type CalendarSegmentGroup = "POST_CONSTRUCTION" | "JANITORIAL_TURNOVER_REQUESTS" | "REAL_ESTATE" | "OTHER";

  const SEGMENT_TO_CALENDAR_GROUP: Record<ProjectSegment, CalendarSegmentGroup> = {
    COMMERCIAL_PAINTING: "POST_CONSTRUCTION",
    COMMERCIAL_CLEANING: "POST_CONSTRUCTION",
    CHANGE_ORDER: "OTHER",
    JANITORIAL_TURNOVER_REQUESTS: "JANITORIAL_TURNOVER_REQUESTS",
    REAL_ESTATE: "REAL_ESTATE",
    OTHER: "OTHER",
  };

  export function calendarSegmentGroup(segment: string): CalendarSegmentGroup {
    return SEGMENT_TO_CALENDAR_GROUP[normalizeProjectSegment(segment)];
  }
