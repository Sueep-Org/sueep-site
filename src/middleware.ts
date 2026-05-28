import { NextResponse, type NextRequest } from "next/server";
import { verifyErpJwtEdge } from "@/lib/erpSessionEdge";
import { erpSessionCookieName } from "@/lib/erpSession";

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
  const logical = logicalErpPath(pathname, host);

  const allowLoginApi = pathname === "/api/erp/auth/login" && request.method === "POST";
  const needsErpAuth =
    (logical.startsWith("/erp") && !logical.startsWith("/erp/login")) ||
    (pathname.startsWith("/api/erp/") && !allowLoginApi);

  if (needsErpAuth) {
    const token = request.cookies.get(erpSessionCookieName)?.value;
    const secret = process.env.ERP_SESSION_SECRET || "";
    const ok = token && secret ? await verifyErpJwtEdge(token, secret) : false;
    if (!ok) {
      if (pathname.startsWith("/api/erp/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginPath = isAppSubdomain(host) ? "/login" : "/erp/login";
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
