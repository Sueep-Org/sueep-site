/** Public marketing site — always sueep.com, never the ERP app host. */
export const MARKETING_SITE_URL = "https://sueep.com";

/** True when the request is for the internal ERP host (app.sueep.com), not the public marketing site. */
export function isAppSubdomainHost(host: string): boolean {
  if (host === "app.sueep.com" || host.startsWith("app.sueep.com:")) return true;
  if (process.env.NODE_ENV === "development") {
    if (host === "app.localhost:3000" || host.startsWith("app.localhost:")) return true;
  }
  return false;
}
