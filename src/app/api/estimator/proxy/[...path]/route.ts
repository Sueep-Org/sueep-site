import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";
import {
  FREE_TRIAL_UPLOAD_LIMIT,
  USAGE_KIND,
  isBlueprintUploadRequest,
  isCompanyPaid,
  isFiguresRequest,
} from "@/lib/estimatorBilling";

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

  // Paywall gate, see estimator-paywall-plan.md §8 for why this lives here
  // (the proxy) rather than in aiestimator-api itself: it's the one place
  // that already resolves the caller's company on every request. Only
  // loads the Company row when the request actually hits a gated route, so
  // the common case (everything else) stays a zero-extra-query passthrough
  // like it always was.
  const isBlueprintUpload = isBlueprintUploadRequest(request.method, path);
  const isFigures = isFiguresRequest(request.method, path);
  let trackUploadOnSuccess = false;

  if (isBlueprintUpload || isFigures) {
    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    if (isBlueprintUpload && !isCompanyPaid(company) && company.freeTrialUploadsUsed >= FREE_TRIAL_UPLOAD_LIMIT) {
      return NextResponse.json(
        { error: "You've used your free upload. Upgrade to Pro to keep going.", code: "FREE_TRIAL_EXHAUSTED" },
        { status: 402 },
      );
    }
    if (isFigures && !isCompanyPaid(company)) {
      return NextResponse.json(
        { error: "Extracted measurements are a Pro feature.", code: "BETA_LOCKED" },
        { status: 402 },
      );
    }
    trackUploadOnSuccess = isBlueprintUpload && !isCompanyPaid(company);
  }

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
  // Who's making this request — used to attribute "last edited by" on
  // save (see get_authenticated_user_identity in aiestimator-api). Same
  // trust model as company-id above: set here server-side from the
  // verified session, never anything the client sends. encodeURIComponent
  // because a display name can contain characters outside the Latin-1
  // range a raw HTTP header value allows; the backend decodes it back.
  if (user.displayName) headers.set("x-estimator-user-name", encodeURIComponent(user.displayName));
  headers.set("x-estimator-user-email", user.email);

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

  // Only counts the free trial once the upload actually succeeded, a
  // rejected/failed upload (bad file, backend error) shouldn't burn a free
  // company's one shot. Checking .ok reads the status only, doesn't touch
  // the body, so this doesn't interfere with streaming it through below.
  if (trackUploadOnSuccess && upstream.ok) {
    try {
      await prisma.$transaction([
        prisma.company.update({
          where: { id: user.companyId },
          data: { freeTrialUploadsUsed: { increment: 1 } },
        }),
        prisma.estimatorUsageEvent.create({
          data: { companyId: user.companyId, userId: user.id, kind: USAGE_KIND.BLUEPRINT_UPLOADED },
        }),
      ]);
    } catch (error) {
      // Don't fail the response over this, the upload itself succeeded
      // and the user should see that. Worst case here is a free company
      // gets one extra upload before this is noticed, not a lost paywall.
      console.error("Failed to record free-trial upload usage", error);
    }
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
