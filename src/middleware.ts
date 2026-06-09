import { NextResponse, type NextRequest } from "next/server";
import { verifyErpJwtEdge } from "@/lib/erpSessionEdge";
import { erpSessionCookieName } from "@/lib/erpSession";
import { isAppSubdomainHost, MARKETING_SITE_URL } from "@/lib/siteHosts";

function hasStaticExtension(pathname: string): boolean {
  const base = pathname.split("/").pop() || "";
  return /\.(ico|png|jpg|jpeg|gif|webp|svg|txt|xml|json|js|css|map|woff2?|ttf|html)$/i.test(base);
}

function isPublicAppPath(pathname: string): boolean {
  return pathname === "/janitorial-turnover" || pathname.startsWith("/janitorial-turnover/");
}

/** Paths served on app.sueep.com (ERP). All other browser paths belong on sueep.com. */
function isErpBrowserPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  if (pathname === "/login") return true;
  if (pathname.startsWith("/erp")) return true;
  return false;
}

function redirectMarketingPathFromApp(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host") || "";
  if (!isAppSubdomainHost(host)) return null;

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/")) return null;
  if (hasStaticExtension(pathname)) return null;
  if (isErpBrowserPath(pathname)) return null;

  const target = new URL(`${pathname}${request.nextUrl.search}`, MARKETING_SITE_URL);
  return NextResponse.redirect(target);
}

/** Browser URL path → internal ERP route. Marketing paths are never mapped into /erp. */
function logicalErpPath(pathname: string, host: string): string {
  if (!isAppSubdomainHost(host)) return pathname;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/")) return pathname;
  if (hasStaticExtension(pathname)) return pathname;
  if (isPublicAppPath(pathname)) return pathname;
  if (pathname === "/" || pathname === "") return "/erp";
  if (pathname === "/login") return "/erp/login";
  return pathname;
}

function rewriteUrlIfNeeded(request: NextRequest): URL | null {
  const host = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;
  if (!isAppSubdomainHost(host)) return null;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/")) return null;
  if (hasStaticExtension(pathname)) return null;
  const logical = logicalErpPath(pathname, host);
  if (logical === pathname) return null;
  const u = request.nextUrl.clone();
  u.pathname = logical;
  return u;
}

export async function middleware(request: NextRequest) {
  const marketingRedirect = redirectMarketingPathFromApp(request);
  if (marketingRedirect) return marketingRedirect;

  const host = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;
  const logical = logicalErpPath(pathname, host);

  const allowLoginApi = pathname === "/api/erp/auth/login" && request.method === "POST";
  // DocuSeal webhook — called by DocuSeal's servers, no ERP session cookie
  const allowDocusealWebhook = pathname === "/api/erp/webhooks/docuseal" && request.method === "POST";
  const needsErpAuth =
    (logical.startsWith("/erp") && !logical.startsWith("/erp/login")) ||
    (pathname.startsWith("/api/erp/") && !allowLoginApi && !allowDocusealWebhook);

  if (needsErpAuth) {
    const token = request.cookies.get(erpSessionCookieName)?.value;
    const secret = process.env.ERP_SESSION_SECRET || "";
    const ok = token && secret ? await verifyErpJwtEdge(token, secret) : false;
    if (!ok) {
      if (pathname.startsWith("/api/erp/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginPath = isAppSubdomainHost(host) ? "/login" : "/erp/login";
      return NextResponse.redirect(new URL(loginPath, request.url));
    }
  }

  const rw = rewriteUrlIfNeeded(request);
  if (rw) {
    return NextResponse.rewrite(rw);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
