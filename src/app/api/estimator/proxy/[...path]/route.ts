import { NextResponse } from "next/server";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";

// Same-origin stand-in for aiestimator-api. The browser used to call that
// Azure host directly, cross-origin, with no auth on the request at all
// (see ESTIMATOR_STORAGE_FIX_PLAN.md, "Session & identity forwarding") --
// this route replaces that, so the browser never needs to hold
// ESTIMATOR_INTERNAL_SECRET and every request carries the caller's real
// company identity, attached here server-side from the session, not from
// anything the client sends.
const ESTIMATOR_API_BASE =
  process.env.ESTIMATOR_API_BASE ||
  "https://ai-estimator-api-code-gaaaajezb3hfh9ex.eastus2-01.azurewebsites.net";

// Recomputed by the runtime once the body is re-streamed; forwarding the
// originals from the upstream response can produce a mismatched/broken
// response (e.g. a stale Content-Length after decompression).
const STRIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

async function handleProxy(request: Request, path: string[]) {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: "Not part of a company yet" }, { status: 403 });

  const secret = process.env.ESTIMATOR_INTERNAL_SECRET;
  if (!secret) {
    console.error("ESTIMATOR_INTERNAL_SECRET is not set, refusing to proxy estimator API calls");
    return NextResponse.json({ error: "Estimator API is not configured" }, { status: 500 });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = `${ESTIMATOR_API_BASE}/${path.join("/")}${incomingUrl.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-estimator-internal-secret", secret);
  headers.set("x-estimator-company-id", user.companyId);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    cache: "no-store",
  };
  // Node's fetch (undici) requires this whenever the body is a stream, not
  // yet part of the DOM RequestInit type, hence the cast above.
  if (hasBody) init.duplex = "half";

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (error) {
    console.error("Estimator API proxy request failed", error);
    return NextResponse.json({ error: "Estimator API is unreachable" }, { status: 502 });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: RouteContext) {
  return handleProxy(request, (await params).path);
}
export async function POST(request: Request, { params }: RouteContext) {
  return handleProxy(request, (await params).path);
}
export async function PUT(request: Request, { params }: RouteContext) {
  return handleProxy(request, (await params).path);
}
export async function PATCH(request: Request, { params }: RouteContext) {
  return handleProxy(request, (await params).path);
}
export async function DELETE(request: Request, { params }: RouteContext) {
  return handleProxy(request, (await params).path);
}
