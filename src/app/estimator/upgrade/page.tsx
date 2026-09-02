"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEstimatorAuth } from "@/lib/estimatorAuthContext";

type BillingInterval = "month" | "six_month" | "year";

type StatusResponse = {
  planTier: "FREE" | "PRO";
  isPaid: boolean;
  isOwner: boolean;
  seats: { used: number; limit: number };
  proSeatLimit: number;
  freeTrial: { used: number; limit: number };
  billing: { interval: BillingInterval | null; status: string | null; currentPeriodEnd: string | null };
};

const INTERVAL_COPY: Record<BillingInterval, { amount: string; period: string; note: string; discounted: boolean }> = {
  month: { amount: "$299", period: "/ mo", note: "Billed monthly", discounted: false },
  six_month: { amount: "$1,435", period: "/ 6 mo", note: "= $239/mo, billed every 6 months", discounted: true },
  year: { amount: "$2,870", period: "/ yr", note: "= $239/mo, billed annually", discounted: true },
};

// Same card recipe as estimator/settings, layered shadow, rounded-2xl,
// slate border, so this page reads as part of the same product instead of
// a bolted-on marketing page.
function Card({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white ${accent ? "border-green-200" : "border-slate-200/70"}`}
      style={{ boxShadow: "0 1px 2px rgba(15,23,42,.04), 0 16px 40px rgba(15,23,42,.06)" }}
    >
      {children}
    </div>
  );
}

function LoadingBar({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm font-medium text-slate-500">
      <span className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-green-100 border-t-green-600" />
      {text}
    </div>
  );
}

function CheckIcon({ dim = false }: { dim?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 flex-shrink-0 ${dim ? "text-slate-300" : "text-green-600"}`}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-shrink-0 text-slate-300">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// The banner up top when this page was reached via a paywall bounce
// (2nd upload, or a beta feature) rather than someone browsing here on
// their own, keyed the same way the proxy's 402 responses carry `code`.
const REASON_COPY: Record<string, string> = {
  FREE_TRIAL_EXHAUSTED: "You've used your free upload. Upgrade to Pro to keep working on new files.",
  BETA_LOCKED: "That's a Pro feature. Upgrade to unlock beta features like wall detection and extracted measurements.",
};

// Same Suspense requirement as estimator/settings, see the comment
// there. useSearchParams() here is for the ?reason=/?checkout= deep links
// from the paywall modal and Stripe's return_url.
export default function EstimatorUpgradePage() {
  return (
    <Suspense>
      <EstimatorUpgradePageInner />
    </Suspense>
  );
}

function EstimatorUpgradePageInner() {
  const { user, loading: authLoading } = useEstimatorAuth();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const checkoutResult = searchParams.get("checkout");

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/estimator/billing/status");
        if (!res.ok) throw new Error(`Failed to load billing status (${res.status})`);
        setStatus(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load billing status");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const price = useMemo(() => INTERVAL_COPY[interval], [interval]);

  async function handleUpgrade() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/estimator/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed to start checkout (${res.status})`);
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start checkout");
      setStarting(false);
    }
  }

  if (authLoading || !user) return <LoadingBar text="Loading…" />;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/estimator" className="text-sm text-green-700 hover:underline">
        ← Back to estimator
      </Link>

      <div className="mt-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Upgrade to Pro</h1>
      </div>

      {reason && REASON_COPY[reason] ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {REASON_COPY[reason]}
        </div>
      ) : null}
      {checkoutResult === "cancelled" ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Checkout was cancelled, no charge was made.
        </div>
      ) : null}

      {loading ? (
        <LoadingBar text="Loading your plan…" />
      ) : !status ? (
        <div className="mt-6 text-sm text-red-600">{error || "Failed to load billing status"}</div>
      ) : status.isPaid ? (
        <Card accent>
          <div className="p-7 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-green-700">You&apos;re on Pro</p>
            <p className="mt-2 text-sm text-slate-600">
              Manage your subscription, seats, and billing details from Settings.
            </p>
            <Link
              href="/estimator/settings?tab=billing"
              className="mt-4 inline-flex rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700"
            >
              Go to billing settings
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="mt-8 text-center">
            <p className="text-sm text-slate-500">The full estimating toolkit is on every plan.</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {[
                "Surface area (SA) measurements",
                "Wall measurements",
                "Crew & labor cost estimating",
                "Mileage & travel costs",
                "Save & export PDF quotes",
                "Shared team project library",
              ].map((feature) => (
                <span
                  key={feature}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600"
                >
                  {feature}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">Free just gets one upload to try it on before deciding.</p>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
              {(["month", "six_month", "year"] as BillingInterval[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInterval(key)}
                  className={
                    interval === key
                      ? "rounded-full bg-green-600 px-4 py-1.5 text-sm font-medium text-white"
                      : "rounded-full px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
                  }
                >
                  {key === "month" ? "Monthly" : key === "six_month" ? "6 Months" : "Yearly"}
                </button>
              ))}
            </div>
            {price.discounted ? (
              <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                Save 20%
              </span>
            ) : null}
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Card>
              <div className="flex h-full flex-col gap-5 p-7">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Free</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">$0</p>
                  <p className="mt-1 text-xs text-slate-400">1 upload, once</p>
                </div>
                <ul className="flex flex-col gap-2.5 text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckIcon /> SA & wall measurements
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> 1 seat
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> {status.freeTrial.limit} free upload, lifetime
                  </li>
                  <li className="flex items-center gap-2 text-slate-400">
                    <XIcon /> Beta features
                  </li>
                </ul>
              </div>
            </Card>

            <Card accent>
              <div className="flex h-full flex-col gap-5 p-7">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Pro</p>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tracking-tight text-slate-900">{price.amount}</span>
                    <span className="text-sm text-slate-500">{price.period}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{price.note}</p>
                </div>
                <ul className="flex flex-col gap-2.5 text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <CheckIcon /> SA & wall measurements
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> Up to {status.proSeatLimit} seats
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> Unlimited uploads, up to 150 pages/file
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon /> Beta features
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={starting || !status.isOwner}
                  className="mt-auto rounded-lg bg-green-600 px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {starting ? "Starting checkout…" : "Upgrade to Pro"}
                </button>
                {!status.isOwner ? (
                  <p className="text-center text-xs text-slate-400">Only your company&apos;s owner can upgrade.</p>
                ) : null}
              </div>
            </Card>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Need more than {status.proSeatLimit} seats or higher volume?{" "}
            <a href="mailto:contact@piramid.ai" className="font-medium text-green-700 hover:underline">
              contact@piramid.ai
            </a>
          </p>

          {error ? <p className="mt-4 text-center text-sm text-red-600">{error}</p> : null}
        </>
      )}
    </main>
  );
}
