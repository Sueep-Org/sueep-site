/** Insurance rows as sent to client components (dates as "YYYY-MM-DD"). */

export type PolicyRow = {
  id: string;
  policyType: string;
  carrier: string;
  policyNumber: string | null;
  effectiveDate: string | null;
  expiresAt: string;
  eachOccurrenceCents: number | null;
  aggregateCents: number | null;
  aggregatePerProject: boolean;
  otherLimits: string | null;
  blanketAdditionalInsured: boolean;
  waiverOfSubrogation: boolean;
  primaryNoncontributory: boolean;
  notes: string | null;
  active: boolean;
  onCertificates: boolean;
};

export type HolderRow = {
  id: string;
  name: string;
  aliases: string[];
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  reqGlOccurrenceCents: number | null;
  reqGlAggregateCents: number | null;
  reqAutoCents: number | null;
  reqUmbrellaCents: number | null;
  reqWcEmployersLiabilityCents: number | null;
  requiresAdditionalInsured: boolean;
  requiresWaiverOfSubrogation: boolean;
  requiresPrimaryNoncontributory: boolean;
  additionalInsureds: string | null;
  specialWording: string | null;
  notes: string | null;
  archived: boolean;
};

/** Cents to the plain dollar text a form field starts with ("1000000"). */
export function centsToField(c: number | null): string {
  return c == null ? "" : String(c / 100);
}
