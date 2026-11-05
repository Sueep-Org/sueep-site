import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageNotifications, getErpAuth } from "@/lib/erpAuth";
import { NOTIFICATIONS, NOTIFICATION_GROUPS, isEmailType } from "@/lib/notificationTypes";
import { easternWallToInstant } from "@/lib/erp/janitorialHours";
import { NotificationsHeader } from "../NotificationsHeader";
import { LogFilters } from "./LogFilters";
import { STATUS_STYLE } from "./status";
import { logHref, readLogFilters } from "./filters";

export const metadata: Metadata = {
  title: "Email Log",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const WEEK_MS = 7 * 86_400_000;

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };

/** Ids of emails with a To, Cc or Bcc address containing `part`. Prisma can
 * only match whole array entries, so this one is plain SQL. */
async function idsSentTo(part: string): Promise<string[]> {
  const like = `%${part.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "EmailLog"
    WHERE lower(array_to_string("to" || "cc" || "bcc", ' ')) LIKE ${like}`;
  return rows.map((r) => r.id);
}

/** Projects and buildings that have at least one email, for the "about" filter. */
async function aboutOptions(): Promise<{ value: string; label: string }[]> {
  const links = await prisma.emailLog.groupBy({ by: ["link"], where: { link: { startsWith: "/erp/" } } });
  const projectIds = new Set<string>();
  const buildingIds = new Set<string>();
  for (const { link } of links) {
    const m = link?.match(/^\/erp\/(projects|buildings)\/([\w-]+)/);
    if (m) (m[1] === "projects" ? projectIds : buildingIds).add(m[2]);
  }
  const [projects, buildings] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: [...projectIds] } }, select: { id: true, jobTitle: true } }),
    prisma.building.findMany({ where: { id: { in: [...buildingIds] } }, select: { id: true, name: true } }),
  ]);
  return [
    ...buildings.map((b) => ({ value: `/erp/buildings/${b.id}`, label: `Building: ${b.name}` })),
    ...projects.map((p) => ({ value: `/erp/projects/${p.id}`, label: `Project: ${p.jobTitle}` })),
  ].sort((a, b) => a.label.localeCompare(b.label));
}

export default async function EmailLogPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManageNotifications(auth.role)) redirect("/erp");

  const params = await searchParams;
  const filters = readLogFilters(params);
  const pageNum = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const sentTo = filters.to ? await idsSentTo(filters.to) : null;
  const createdAt: Prisma.DateTimeFilter = {
    ...(filters.from ? { gte: easternWallToInstant(filters.from, "00:00") } : {}),
    ...(filters.until ? { lt: new Date(easternWallToInstant(filters.until, "00:00").getTime() + 86_400_000) } : {}),
  };
  const where: Prisma.EmailLogWhereInput = {
    ...(isEmailType(filters.type) ? { type: filters.type } : {}),
    ...(filters.status in STATUS_STYLE ? { status: filters.status } : {}),
    ...(filters.q ? { subject: { contains: filters.q, mode: "insensitive" } } : {}),
    ...(sentTo ? { id: { in: sentTo } } : {}),
    ...(filters.from || filters.until ? { createdAt } : {}),
    // A link can carry a tab or anchor after the id, e.g. /erp/projects/abc?tab=billing
    ...(filters.about
      ? { OR: [{ link: filters.about }, { link: { startsWith: `${filters.about}?` } }, { link: { startsWith: `${filters.about}#` } }, { link: { startsWith: `${filters.about}/` } }] }
      : {}),
    ...(filters.attach ? { hasAttachments: true } : {}),
    ...(filters.resent ? { resentFromId: { not: null } } : {}),
  };

  const [logs, total, failedThisWeek, about] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, createdAt: true, type: true, to: true, cc: true, subject: true, status: true, error: true, resentFromId: true },
    }),
    prisma.emailLog.count({ where }),
    prisma.emailLog.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - WEEK_MS) } } }),
    aboutOptions(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => logHref(filters, n);

  return (
    <div className="space-y-6">
      <NotificationsHeader active="log" failedCount={failedThisWeek} />
      <LogFilters
        filters={filters}
        total={total}
        aboutOptions={about}
        typeOptions={Object.entries(NOTIFICATIONS)
          .map(([value, d]) => ({ value, label: `${d.group}: ${d.label}`, order: NOTIFICATION_GROUPS.indexOf(d.group) }))
          .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
          .map(({ value, label }) => ({ value, label }))}
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
