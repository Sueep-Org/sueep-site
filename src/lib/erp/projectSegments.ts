export const PROJECT_SEGMENTS = [
    "COMMERCIAL_PAINTING",
    "COMMERCIAL_CLEANING",
    "RESIDENTIAL_PAINTING",
    "CHANGE_ORDER",
    "JANITORIAL_TURNOVER_REQUESTS",
    "OTHER",
  ] as const;
  
  export type ProjectSegment = (typeof PROJECT_SEGMENTS)[number];
  
  const LEGACY_SEGMENT_MAP: Record<string, ProjectSegment> = {
    COMMERCIAL: "COMMERCIAL_CLEANING",
    RESIDENTIAL: "RESIDENTIAL_PAINTING",
  };
  
  const SEGMENT_LABELS: Record<ProjectSegment, string> = {
    COMMERCIAL_PAINTING: "Commercial painting",
    COMMERCIAL_CLEANING: "Commercial cleaning",
    RESIDENTIAL_PAINTING: "Residential painting",
    CHANGE_ORDER: "Change order",
    JANITORIAL_TURNOVER_REQUESTS: "Janitorial turnover requests",
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