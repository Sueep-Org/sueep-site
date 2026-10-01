import type { InsurancePolicy, CoiHolder } from "@prisma/client";
import { utcDateKey } from "@/lib/erp/dates";
import type { PolicyRow, HolderRow } from "./types";

export function toPolicyRow(p: InsurancePolicy): PolicyRow {
  return {
    id: p.id,
    policyType: p.policyType,
    carrier: p.carrier,
    policyNumber: p.policyNumber,
    effectiveDate: p.effectiveDate ? utcDateKey(p.effectiveDate) : null,
    expiresAt: utcDateKey(p.expiresAt),
    eachOccurrenceCents: p.eachOccurrenceCents,
    aggregateCents: p.aggregateCents,
    aggregatePerProject: p.aggregatePerProject,
    otherLimits: p.otherLimits,
    blanketAdditionalInsured: p.blanketAdditionalInsured,
    waiverOfSubrogation: p.waiverOfSubrogation,
    primaryNoncontributory: p.primaryNoncontributory,
    notes: p.notes,
    active: p.active,
    onCertificates: p.onCertificates,
  };
}

export function toHolderRow(h: CoiHolder): HolderRow {
  return {
    id: h.id,
    name: h.name,
    aliases: h.aliases,
    address: h.address,
    contactName: h.contactName,
    contactEmail: h.contactEmail,
    contactPhone: h.contactPhone,
    reqGlOccurrenceCents: h.reqGlOccurrenceCents,
    reqGlAggregateCents: h.reqGlAggregateCents,
    reqAutoCents: h.reqAutoCents,
    reqUmbrellaCents: h.reqUmbrellaCents,
    reqWcEmployersLiabilityCents: h.reqWcEmployersLiabilityCents,
    requiresAdditionalInsured: h.requiresAdditionalInsured,
    requiresWaiverOfSubrogation: h.requiresWaiverOfSubrogation,
    requiresPrimaryNoncontributory: h.requiresPrimaryNoncontributory,
    additionalInsureds: h.additionalInsureds,
    specialWording: h.specialWording,
    notes: h.notes,
    archived: h.archived,
  };
}
