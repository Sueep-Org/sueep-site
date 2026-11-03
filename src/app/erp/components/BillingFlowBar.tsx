"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { centsToDollarsCompact } from "@/lib/erp/money";

export type BillingFlow = {
  canBill: boolean;
  canSeeInvoices: boolean;
  canOpenQuickBooks: boolean;
  notBilled: number | null;
  toApprove: number | null;
  needsSending: number | null;
  unpaidCents: number | null;
  overdue: number | null;
};

// One request per page load, shared by the bar and anything else that asks.
let pending: Promise<BillingFlow | null> | null = null;
function fetchFlow(): Promise<BillingFlow | null> {
  pending ??= fetch("/api/erp/billing/flow")
    .then((r) => (r.ok ? (r.json() as Promise<BillingFlow>) : null))
    .catch(() => null);
  return pending;
}

/** What this person can open in the billing flow, and its counts. Null while loading. */
export function useBillingFlow(): BillingFlow | null {
  const [flow, setFlow] = useState<BillingFlow | null>(null);
  useEffect(() => {
    let live = true;
    void fetchFlow().then((f) => live && setFlow(f));
    return () => {
      live = false;
    };
  }, []);
  return flow;
}

type Step = { key: "billing" | "send" | "invoices"; label: string; href: string; note: string | null; alert: boolean };

/**
 * Project Billing → Ready to send → Invoices, with one number each, on top of
 * all three pages so it's clear where work goes next. Hidden when the person
 * can only open one of them.
 */
export function BillingFlowBar({ current }: { current: Step["key"] }) {
  const flow = useBillingFlow();
  if (!flow) return <div className="h-7" aria-hidden />;

  const steps: Step[] = [
    {
      key: "billing",
      label: "Project Billing",
      href: "/erp/billing",
      note: flow.notBilled ? `${flow.notBilled} to bill` : null,
      alert: false,
    },
    ...(flow.canBill
      ? [
          {
            key: "send" as const,
            label: "Ready to send",
            href: "/erp/ready-to-send",
            note: [flow.toApprove ? `${flow.toApprove} to approve` : null, flow.needsSending ? `${flow.needsSending} to send` : null].filter(Boolean).join(" · ") || null,
            alert: !!flow.needsSending,
          },
        ]
      : []),
    ...(flow.canSeeInvoices
      ? [
          {
            key: "invoices" as const,
            label: "Invoices",
            href: flow.overdue ? "/erp/invoices?filter=overdue" : "/erp/invoices",
            note: flow.unpaidCents ? `${centsToDollarsCompact(flow.unpaidCents)} unpaid` : null,
            alert: !!flow.overdue,
          },
        ]
      : []),
  ];
  if (steps.length < 2) return null;

  return (
    <nav aria-label="Billing steps" className="flex flex-wrap items-center gap-1 text-xs">
      {steps.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          {i > 0 && (
            <span aria-hidden className="px-1 text-gray-300">
              →
            </span>
          )}
          {s.key === current ? (
            <span aria-current="page" className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 font-semibold text-pink-700">
              {s.label}
              {s.note && <span className="font-normal text-pink-600">{s.note}</span>}
            </span>
          ) : (
            <Link href={s.href} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
              {s.label}
              {s.note && <span className="text-gray-400">{s.note}</span>}
              {s.alert && <span aria-label="Needs attention" className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
