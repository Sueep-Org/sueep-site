/** Masks a bank account/routing number down to its last 4 digits for
 * display in collapsed-section summaries — e.g. "••••1234". Shared by the
 * Employee and Contractor profile pages so their status lines format the
 * same way. */
export function maskAccountNumber(num: string | null | undefined): string {
  if (!num) return "";
  return num.length > 4 ? `••••${num.slice(-4)}` : "••••";
}
