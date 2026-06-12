export const TURNOVER_PRICING_ADMIN_NAMES = ["nick", "david", "edwin", "emma"] as const;
export const TURNOVER_PRICING_ADMIN_EMAILS = ["jefferson@sueep.com"] as const;

export function isTurnoverPricingAdmin(identity: string | null | undefined) {
  const normalized = String(identity || "").trim().toLowerCase();
  if (!normalized) return false;
  if (TURNOVER_PRICING_ADMIN_EMAILS.includes(normalized as (typeof TURNOVER_PRICING_ADMIN_EMAILS)[number])) {
    return true;
  }
  const localPart = normalized.split("@")[0]?.replace(/[^a-z]/g, "") || "";
  return TURNOVER_PRICING_ADMIN_NAMES.some((name) => normalized.includes(name) || localPart === name);
}
