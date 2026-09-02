import Stripe from "stripe";
import type { Company } from "@prisma/client";

// Central place for the paywall's numbers and Stripe wiring, see
// estimator-paywall-plan.md. Every limit lives here as a named constant,
// not scattered inline through the routes that check them, so tuning any
// of them later is a one-line change.

/** Free companies get exactly 1 blueprint upload, ever, not a monthly
 * allowance, and not a per-page cap (see plan §8 for why it's per-upload,
 * not per-page). */
export const FREE_TRIAL_UPLOAD_LIMIT = 1;

/** Reserved for Phase 6 (chatbot limits), the chatbot itself isn't built
 * yet, so nothing reads these today. Numbers sized off the separate
 * Phi-4-mini cost brief's usage baseline (~35 convos/user/month realistic
 * usage, 10/day hard cap shared by every user regardless of plan). Kept
 * here now so Phase 6 is "wire this up," not "decide the numbers too." */
export const CHAT_CONVERSATIONS_PER_MONTH = { FREE: 10, PRO: 50 } as const;

/** `EstimatorUsageEvent.kind` values. Only one exists today, the free
 * upload trial, but this is the enum the chatbot's CHAT_CONVERSATION kind
 * joins in Phase 6, same table, same shape. */
export const USAGE_KIND = {
  BLUEPRINT_UPLOADED: "BLUEPRINT_UPLOADED",
} as const;

export type EstimatorBillingInterval = "month" | "six_month" | "year";

function requirePriceId(envVar: string, label: string): string {
  const value = process.env[envVar];
  if (!value) throw new Error(`${envVar} is not set (${label} Stripe price)`);
  return value;
}

/** The 3 Sandbox/live prices under the one "Piramid Estimator Pro" product
 *, see .env.local and estimator-paywall-plan.md Phase 0. */
export function estimatorPriceId(interval: EstimatorBillingInterval): string {
  switch (interval) {
    case "month":
      return requirePriceId("ESTIMATOR_STRIPE_PRICE_MONTHLY", "monthly");
    case "six_month":
      return requirePriceId("ESTIMATOR_STRIPE_PRICE_SIX_MONTH", "6-month");
    case "year":
      return requirePriceId("ESTIMATOR_STRIPE_PRICE_YEARLY", "yearly");
  }
}

export function isEstimatorBillingInterval(value: unknown): value is EstimatorBillingInterval {
  return value === "month" || value === "six_month" || value === "year";
}

/** Maps a Stripe subscription's actual recurring price back to one of our
 * 3 intervals, used on the webhook side rather than trusting metadata,
 * since metadata can go stale (e.g. someone changes the price in Checkout
 * outside our own UI) while the subscription's own price never lies. */
export function billingIntervalFromRecurring(
  recurring: Stripe.Price.Recurring | null | undefined,
): EstimatorBillingInterval | null {
  if (!recurring) return null;
  if (recurring.interval === "month" && recurring.interval_count === 1) return "month";
  if (recurring.interval === "month" && recurring.interval_count === 6) return "six_month";
  if (recurring.interval === "year" && recurring.interval_count === 1) return "year";
  return null;
}

// Which proxied aiestimator-api calls the paywall actually gates, kept
// here rather than inlined in the proxy route because "which routes are
// gated" is a product decision, same category as the limit numbers above,
// not routing plumbing. Path segments are what's left after
// /api/estimator/proxy/, a request to .../proxy/api/projects/abc/blueprint
// arrives at the proxy as ["api", "projects", "abc", "blueprint"]. Backend
// route shapes confirmed against aiestimator-api's router_projects.py
// (mounted at /api/projects) and the frontend's actual fetch calls in
// simple-app.js, not guessed, see estimator-paywall-plan.md §8.

/** POST .../api/projects/{id}/blueprint, the actual "free trial" gate.
 * Analysis itself (page-by-page) runs in a background task inside
 * aiestimator-api afterward, out of the proxy's view, so this is a
 * per-upload gate, not a per-page one. */
export function isBlueprintUploadRequest(method: string, path: string[]): boolean {
  return method === "POST" && path.length === 4 && path[0] === "api" && path[1] === "projects" && path[3] === "blueprint";
}

/** GET .../api/projects/{id}/figures, where the beta-only extracted
 * measurements (and server-computed wall data) come back. Blocked outright
 * for FREE companies, not just capped, matches the beta-features decision
 * in plan §2. Doesn't cover the wallWorker.js client-side fallback path,
 * which has no backend call to gate at all (accepted gap, plan §8). */
export function isFiguresRequest(method: string, path: string[]): boolean {
  return method === "GET" && path.length === 4 && path[0] === "api" && path[1] === "projects" && path[3] === "figures";
}

export function getStripeClient(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(secret);
}

/** Source of truth for "does this company have Pro access right now,"
 * planTier is what the webhook keeps in sync with Stripe, so entitlement
 * checks never need a live Stripe API call on the request path.
 * isInternal (Piramid's own Sueep company) always counts as paid, no
 * subscription required, see the field's doc comment in schema.prisma. */
export function isCompanyPaid(company: Pick<Company, "planTier" | "isInternal">): boolean {
  return company.isInternal || company.planTier === "PRO";
}

/** No real company will ever have this many people on it — used as "no
 * cap" for internal accounts instead of Infinity, which doesn't survive
 * JSON (JSON.stringify(Infinity) is `null`, which would've silently
 * turned the billing status API's seat limit into `null` instead of a
 * number). */
const UNLIMITED_SEATS = 1_000_000;

/** Free companies are 1 seat (the signup owner), not the stored
 * `seatLimit` value, that column defaults to 5 for every company
 * regardless of plan so Pro doesn't need a second migration to raise it
 * per-company, but Free was never meant to read it directly. Internal
 * companies have no real cap at all. Everywhere that checks or displays a
 * seat cap should go through this, not `company.seatLimit` on its own. */
export function effectiveSeatLimit(company: Pick<Company, "planTier" | "seatLimit" | "isInternal">): number {
  if (company.isInternal) return UNLIMITED_SEATS;
  return isCompanyPaid(company) ? company.seatLimit : 1;
}

/** Grace-period decision (plan §9): stay on Pro through Stripe's own
 * retry window on a failed charge, only downgrade once Stripe itself
 * gives up (status becomes canceled/unpaid/incomplete_expired), not on
 * the first missed payment. */
export function planTierFromSubscriptionStatus(status: Stripe.Subscription.Status): "FREE" | "PRO" {
  return status === "active" || status === "trialing" || status === "past_due" ? "PRO" : "FREE";
}
