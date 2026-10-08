import { inputToCents } from "@/lib/erp/money";

export type YearInput = { annualVolumeCents: bigint | null; comment: string | null };

export function parseYearBody(body: Record<string, unknown>): { data: YearInput } | { error: string } {
  const raw = body.annualVolume;
  const cents = inputToCents(raw);
  if (raw != null && raw !== "" && cents == null) return { error: "Annual volume must be a dollar amount." };
  if (cents != null && cents < 0) return { error: "Annual volume can't be negative." };
  const comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim() : null;
  return { data: { annualVolumeCents: cents == null ? null : BigInt(cents), comment } };
}
