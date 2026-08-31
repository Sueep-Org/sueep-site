import { NextResponse, type NextRequest } from "next/server";
import { verifyErpJwtEdge } from "@/lib/erpSessionEdge";
import { erpSessionCookieName } from "@/lib/erpSession";
import { estimatorSessionCookieName } from "@/lib/estimatorSession";

function isAppSubdomain(host: string): boolean {
  if (host === "app.sueep.com" || host.startsWith("app.sueep.com:")) return true;
  if (process.env.NODE_ENV === "development") {
    if (host === "app.localhost:3000" || host.startsWith("app.localhost:")) return true;
  }
  return false;
}

function hasStaticExtension(pathname: string): boolean {
  const base = pathname.split("/").pop() || "";
  return /\.(ico|png|jpg|jpeg|gif|webp|svg|txt|xml|json|js|css|map|woff2?|ttf|html)$/i.test(base);
}

function isPublicAppPath(pathname: string): boolean {
  return pathname === "/janitorial-turnover" || pathname.startsWith("/janitorial-turnover/");
}

/** Browser URL path → internal app route (same as rewrite target). */
function logicalErpPath(pathname: string, host: string): string {
  if (!isAppSubdomain(host)) return pathname;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/")) return pathname;
  if (hasStaticExtension(pathname)) return pathname;
  if (isPublicAppPath(pathname)) return pathname;
  if (pathname === "/estimator" || pathname.startsWith("/estimator/")) return pathname;
  if (pathname === "/" || pathname === "") return "/erp";
  if (pathname === "/login") return "/erp/login";
  if (!pathname.startsWith("/erp")) return `/erp${pathname}`;
  return pathname;
}

function rewriteUrlIfNeeded(request: NextRequest): URL | null {
  const host = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;
  if (!isAppSubdomain(host)) return null;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api/")) return null;
  if (hasStaticExtension(pathname)) return null;
  const logical = logicalErpPath(pathname, host);
  if (logical === pathname) return null;
  const u = request.nextUrl.clone();
  u.pathname = logical;
  return u;
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;
  const isEstimatorRoute = pathname === "/estimator" || pathname.startsWith("/estimator/");
  const logical = logicalErpPath(pathname, host);

  if (isEstimatorRoute && !isAppSubdomain(host)) {
    const redirectUrl = new URL(request.url);
    redirectUrl.host = process.env.NODE_ENV === "development" ? "app.localhost:3000" : "app.sueep.com";
    return NextResponse.redirect(redirectUrl);
  }

  const allowLoginApi = pathname === "/api/erp/auth/login" && request.method === "POST";
  // DocuSeal webhook — called by DocuSeal's servers, no ERP session cookie
  const allowDocusealWebhook = pathname === "/api/erp/webhooks/docuseal" && request.method === "POST";
  const isEstimatorPath = logical === "/estimator" || logical.startsWith("/estimator/");
  const isEstimatorApi = pathname === "/api/estimator" || pathname.startsWith("/api/estimator/");

  if (isEstimatorPath || isEstimatorApi) {
    // Allow static assets to pass through (e.g. /estimator/simple-app.js)
    if (hasStaticExtension(pathname)) {
      // do nothing; let static file serve
    } else {
      const isEstimatorPublicPath = logical === "/estimator/login" || logical === "/estimator/signup" || logical === "/estimator/forgot-password";
      const isEstimatorAuthApi = pathname.startsWith("/api/estimator/auth/");
      const needsEstimatorAuth = isEstimatorApi ? !isEstimatorAuthApi : !isEstimatorPublicPath;
      if (needsEstimatorAuth) {
        const token = request.cookies.get(estimatorSessionCookieName)?.value;
        const secret = process.env.ESTIMATOR_SESSION_SECRET || "";
        // Use the estimator edge verifier (not the ERP verifier)
        const ok = token && secret ? await (await import("@/lib/estimatorSessionEdge")).verifyEstimatorJwtEdge(token, secret) : false;
        if (!ok) {
          if (isEstimatorApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
          return NextResponse.redirect(new URL("/estimator/login", request.url));
        }
      }
    }
  }

  const needsErpAuth =
    (logical.startsWith("/erp") && !logical.startsWith("/erp/login")) ||
    (pathname.startsWith("/api/erp/") && !allowLoginApi && !allowDocusealWebhook);

  if (needsErpAuth) {
    const token = request.cookies.get(erpSessionCookieName)?.value;
    const secret = process.env.ERP_SESSION_SECRET || "";
    const session = token && secret ? await verifyErpJwtEdge(token, secret) : null;
    if (!session) {
      if (pathname.startsWith("/api/erp/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginPath = isAppSubdomain(host) ? "/login" : "/erp/login";
      return NextResponse.redirect(new URL(loginPath, request.url));
    }

    // Attach role/uid headers for server components and API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-erp-role", session.role);
    requestHeaders.set("x-erp-uid", session.uid);
    requestHeaders.set("x-erp-email", session.email);

    const rw = rewriteUrlIfNeeded(request);
    const nextOpts = { request: { headers: requestHeaders } };
    if (rw) return NextResponse.rewrite(rw, nextOpts);
    return NextResponse.next(nextOpts);
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
