/** Public path when no env override (relative). */
export const DEFAULT_RESIDENTIAL_PAINTING_CONTRACT_HREF = "/painting/contract";

/** Absolute URL for Stripe Checkout (terms link in custom text + Dashboard ToS should match). */
export function resolvePaintingContractAbsoluteUrl(siteOrigin: string): string {
  const base = siteOrigin.replace(/\/$/, "");
  const raw = process.env.NEXT_PUBLIC_RESIDENTIAL_PAINTING_CONTRACT_URL?.trim();
  if (!raw) return `${base}${DEFAULT_RESIDENTIAL_PAINTING_CONTRACT_HREF}`;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${path}`;
}
