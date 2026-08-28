export const TRANSPORTATION_METHODS = [
  "COMPANY_VAN",
  "EMPLOYEE_VEHICLE",
  "PICKUP",
  "MEETUP_SPOT",
] as const;

export type TransportationMethod = (typeof TRANSPORTATION_METHODS)[number];

const TRANSPORTATION_METHOD_LABELS: Record<TransportationMethod, string> = {
  COMPANY_VAN: "Company van",
  EMPLOYEE_VEHICLE: "Employee vehicle",
  PICKUP: "Pickup laborers",
  MEETUP_SPOT: "Meet-up spot",
};

export const TRANSPORTATION_METHOD_OPTIONS = TRANSPORTATION_METHODS.map((value) => ({
  value,
  label: TRANSPORTATION_METHOD_LABELS[value],
}));

export function transportationMethodLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return TRANSPORTATION_METHOD_LABELS[raw as TransportationMethod] ?? null;
}

const TRANSPORTATION_METHOD_SHORT_LABELS: Record<TransportationMethod, string> = {
  COMPANY_VAN: "Van",
  EMPLOYEE_VEHICLE: "Own vehicle",
  PICKUP: "Pickup",
  MEETUP_SPOT: "Meet-up",
};

/** Compact form for table cells, where the full label ("Employee vehicle") is too wide. */
export function transportationMethodShortLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return TRANSPORTATION_METHOD_SHORT_LABELS[raw as TransportationMethod] ?? null;
}
