import type { CompanyFinancialYear, CompanyInfoAccessLog, CompanyInfoField, CompanyLogin, Prisma } from "@prisma/client";
import { utcDateKey } from "./dates";
import {
  isCompanyDocKind,
  isCompanyInfoSection,
  type AccessLogRow,
  type CompanyDocumentRow,
  type CompanyInfoInput,
  type CompanyInfoRow,
  type CompanyLoginInput,
  type CompanyLoginRow,
  type FinancialYearRow,
} from "./companyInfo";
import { decryptSecret, encryptSecret, maskSecret } from "./secretBox";

export function toCompanyInfoRow(f: CompanyInfoField): CompanyInfoRow {
  let masked: string | null = null;
  if (f.sensitive && f.valueEncrypted) {
    try {
      masked = maskSecret(decryptSecret(f.valueEncrypted));
    } catch {
      // Key missing or changed: still show that something is stored.
      masked = "••••";
    }
  }
  return {
    id: f.id,
    section: isCompanyInfoSection(f.section) ? f.section : "COMPANY",
    label: f.label,
    value: f.sensitive ? null : f.value,
    sensitive: f.sensitive,
    masked,
    comment: f.comment,
    link: f.link,
    expiresAt: f.expiresAt ? utcDateKey(f.expiresAt) : null,
    updatedAt: f.updatedAt.toISOString(),
    updatedByEmail: f.updatedByEmail,
  };
}

/**
 * Columns to write for a create or update. Sensitive values only ever land
 * in valueEncrypted; turning sensitive off moves the value back to plain.
 * `existing` is null on create.
 */
export function companyInfoWriteData(
  input: CompanyInfoInput,
  existing: Pick<CompanyInfoField, "value" | "valueEncrypted" | "sensitive"> | null,
  email: string,
): Omit<Prisma.CompanyInfoFieldUncheckedCreateInput, "sortOrder"> {
  // The plain value as it stands after this edit.
  let plain: string | null;
  if (input.value !== undefined) plain = input.value;
  else if (existing?.sensitive && existing.valueEncrypted) plain = decryptSecret(existing.valueEncrypted);
  else plain = existing?.value ?? null;

  return {
    section: input.section,
    label: input.label,
    sensitive: input.sensitive,
    value: input.sensitive ? null : plain,
    valueEncrypted: input.sensitive && plain ? encryptSecret(plain) : null,
    comment: input.comment,
    link: input.link,
    expiresAt: input.expiresAt,
    updatedByEmail: email,
  };
}

export function toFinancialYearRow(y: CompanyFinancialYear): FinancialYearRow {
  return {
    id: y.id,
    year: y.year,
    annualVolumeCents: y.annualVolumeCents == null ? null : Number(y.annualVolumeCents),
    comment: y.comment,
  };
}

/** Never includes the file bytes; those come from the download route. */
export const companyDocumentListSelect = {
  id: true,
  kind: true,
  year: true,
  label: true,
  linkUrl: true,
  filename: true,
  size: true,
  createdAt: true,
  uploadedByEmail: true,
} satisfies Prisma.CompanyDocumentSelect;

export function toCompanyDocumentRow(d: Prisma.CompanyDocumentGetPayload<{ select: typeof companyDocumentListSelect }>): CompanyDocumentRow {
  return {
    id: d.id,
    kind: isCompanyDocKind(d.kind) ? d.kind : "OTHER",
    year: d.year,
    label: d.label,
    linkUrl: d.linkUrl,
    filename: d.filename,
    size: d.size,
    createdAt: d.createdAt.toISOString(),
    uploadedByEmail: d.uploadedByEmail,
  };
}

export function toCompanyLoginRow(l: CompanyLogin): CompanyLoginRow {
  return {
    id: l.id,
    name: l.name,
    url: l.url,
    username: l.username,
    hasPassword: !!l.passwordEncrypted,
    passwordChangedAt: l.passwordChangedAt?.toISOString() ?? null,
    owner: l.owner,
    notes: l.notes,
    updatedAt: l.updatedAt.toISOString(),
    updatedByEmail: l.updatedByEmail,
  };
}

/** Columns to write for a login create or update. The password is
 * encrypted here and nowhere else. */
export function companyLoginWriteData(input: CompanyLoginInput, email: string): Prisma.CompanyLoginUncheckedCreateInput {
  const data: Prisma.CompanyLoginUncheckedCreateInput = {
    name: input.name,
    url: input.url,
    username: input.username,
    owner: input.owner,
    notes: input.notes,
    updatedByEmail: email,
  };
  if (input.password !== undefined) {
    data.passwordEncrypted = input.password == null ? null : encryptSecret(input.password);
    data.passwordChangedAt = input.password == null ? null : new Date();
  }
  return data;
}

export function toAccessLogRow(l: CompanyInfoAccessLog): AccessLogRow {
  return {
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    targetType: l.targetType === "LOGIN" ? "LOGIN" : "FIELD",
    label: l.label,
    action: l.action === "COPY" ? "COPY" : "REVEAL",
    userEmail: l.userEmail,
  };
}
