import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";
import { FREE_TRIAL_UPLOAD_LIMIT, effectiveSeatLimit, isCompanyPaid } from "@/lib/estimatorBilling";

// Read-only plan/seat/trial snapshot, the one thing both the React
// Settings > Billing tab and the vanilla-JS canvas UI (locked beta button,
// paywall modal copy) need to know client-side. Anyone on the company can
// read it (matches the invite-code visibility in /api/estimator/company);
// only checkout/portal are owner-gated, this is just status.
export async function GET() {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: "Not part of a company yet" }, { status: 403 });

  const [company, seatsUsed] = await Promise.all([
    prisma.company.findUnique({ where: { id: user.companyId } }),
    prisma.estimatorUser.count({ where: { companyId: user.companyId } }),
  ]);
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  return NextResponse.json({
    planTier: company.planTier,
    isPaid: isCompanyPaid(company),
    // Piramid's own company, exempt from the paywall entirely (see
    // estimatorBilling.isCompanyPaid). Surfaced separately from isPaid so
    // the UI can tell "actually subscribed through Stripe" apart from
    // "exempt," those need different billing-tab treatment (no portal to
    // manage, since there's no real subscription behind this).
    isInternal: company.isInternal,
    isOwner: user.role === "OWNER",
    // `seats.limit` is the current effective cap (1 for Free, matching what
    // actually blocks a join right now, see estimatorBilling.effectiveSeatLimit).
    // `proSeatLimit` is the raw stored value, what Pro itself offers,
    // separate because the upgrade page needs to say "Pro gives you up to
    // 5 seats" even while looking at it from a Free account that's
    // currently capped at 1, not the same number.
    seats: { used: seatsUsed, limit: effectiveSeatLimit(company) },
    proSeatLimit: company.seatLimit,
    freeTrial: { used: company.freeTrialUploadsUsed, limit: FREE_TRIAL_UPLOAD_LIMIT },
    billing: {
      interval: company.stripeBillingInterval,
      status: company.stripeSubscriptionStatus,
      currentPeriodEnd: company.currentPeriodEnd,
    },
  });
}
