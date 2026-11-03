"use client";

import Link from "next/link";
import type { QboStatus } from "@/lib/erp/qboStatus";

/** The one status: everything matches, or a few plain sentences. (The Finance tab works out by itself which months QuickBooks is done for.) */
export function QuickBooksStatus({ status }: { status: QboStatus }) {
  const ok = status.items.length === 0;

  return (
    <section className={`space-y-3 rounded-lg border p-5 shadow-sm ${ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <h2 className={`text-lg font-semibold ${ok ? "text-emerald-800" : "text-amber-900"}`}>
        {ok ? "Everything matches" : `${status.items.length + status.more} thing${status.items.length + status.more === 1 ? "" : "s"} to fix`}
      </h2>
      {ok ? (
        <p className="text-sm text-emerald-800">The ERP and QuickBooks agree on money owed and on every month that isn&apos;t closed yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm text-gray-800">
          {status.items.map((i, n) => (
            <li key={n} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              <span>
                {i.text}
                {i.href ? (
                  <>
                    {" "}
                    <Link href={i.href} className="font-medium text-pink-600 hover:underline">See why</Link>
                  </>
                ) : null}
              </span>
            </li>
          ))}
          {status.more > 0 ? <li className="pl-3.5 text-gray-500">and {status.more} more on the details page</li> : null}
        </ul>
      )}

    </section>
  );
}
