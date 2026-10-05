import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageNotifications, getErpAuth } from "@/lib/erpAuth";
import { NOTIFICATIONS, isEmailType } from "@/lib/notificationTypes";
import { NotificationsHeader } from "../NotificationsHeader";
import { LogFilters } from "./LogFilters";
import { STATUS_STYLE } from "./status";

export const metadata: Metadata = {
  title: "Email Log",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const WEEK_MS = 7 * 86_400_000;

type PageProps = { searchParams: Promise<{ type?: string; status?: string; q?: string; page?: string }> };

export default async function EmailLogPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManageNotifications(auth.role)) redirect("/erp");

  const { type = "", status = "", q = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const search = q.trim();

  const where: Prisma.EmailLogWhereInput = {
    ...(isEmailType(type) ? { type } : {}),
    ...(status in STATUS_STYLE ? { status } : {}),
    ...(search
      ? { OR: [{ subject: { contains: search, mode: "insensitive" } }, { to: { has: search.toLowerCase() } }, { to: { has: search } }] }
      : {}),
  };

  const [logs, total, failedThisWeek] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, createdAt: true, type: true, to: true, cc: true, subject: true, status: true, error: true, resentFromId: true },
    }),
    prisma.emailLog.count({ where }),
    prisma.emailLog.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - WEEK_MS) } } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (status) p.set("status", status);
    if (search) p.set("q", search);
    if (n > 1) p.set("page", String(n));
    const s = p.toString();
    return `/erp/notifications/log${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <NotificationsHeader active="log" failedCount={failedThisWeek} />
      <LogFilters
        type={type}
        status={status}
        q={search}
        typeOptions={Object.entries(NOTIFICATIONS)
          .map(([value, d]) => ({ value, label: d.label }))
          .sort((a, b) => a.label.localeCompare(b.label))}
      />

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
            <tr>
              <th className="px-4 py-2">Sent</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">To</th>
              <th className="px-4 py-2">Subject</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  No emails match.
                </td>
              </tr>
            ) : (
              logs.map((log, i) => {
                const style = STATUS_STYLE[log.status] ?? STATUS_STYLE.SENT;
                const label = isEmailType(log.type) ? NOTIFICATIONS[log.type].label : log.type;
                const recipients = [...log.to, ...log.cc];
                return (
                  <tr key={log.id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">
                      <Link href={`/erp/notifications/log/${log.id}`} className="hover:underline">
                        {log.createdAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{label}</td>
                    <td className="max-w-[14rem] truncate px-4 py-2.5 text-gray-700" title={recipients.join(", ")}>
                      {recipients[0] ?? "Nobody"}
                      {recipients.length > 1 && <span className="text-gray-400"> +{recipients.length - 1}</span>}
                    </td>
                    <td className="max-w-[22rem] truncate px-4 py-2.5">
                      <Link href={`/erp/notifications/log/${log.id}`} className="text-gray-900 hover:underline" title={log.subject}>
                        {log.resentFromId && <span className="mr-1 text-xs text-gray-400">(resent)</span>}
                        {log.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span title={log.error ?? undefined} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style.cls}`}>
                        {style.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {pageNum} of {pages}, {total} emails
          </span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link href={pageHref(pageNum - 1)} className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50">
                Newer
              </Link>
            )}
            {pageNum < pages && (
              <Link href={pageHref(pageNum + 1)} className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50">
                Older
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
