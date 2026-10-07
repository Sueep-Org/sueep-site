import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { NOTIFICATION_GROUPS, type NotificationGroup } from "@/lib/notificationTypes";
import { allListedWhere, canSeeAllEmails, inboxEmail, sentToWhere, typesInGroup, unreadCount } from "@/lib/erp/inbox";
import { InfoTip } from "@/app/erp/components/ui";
import { AREA_DOT, emailMeta, nyDayKey, shortWhen } from "./areas";
import { InboxFilters } from "./InboxFilters";
import { MarkAllReadButton } from "./MarkAllReadButton";

export const metadata: Metadata = {
  title: "Notifications",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type PageProps = { searchParams: Promise<{ view?: string; area?: string; unread?: string; q?: string; page?: string }> };

function isGroup(v: string): v is NotificationGroup {
  return (NOTIFICATION_GROUPS as string[]).includes(v);
}

export default async function InboxPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth) redirect("/erp/login");
  const me = inboxEmail(auth);

  const sp = await searchParams;
  const allView = sp.view === "all" && canSeeAllEmails(auth);
  const area = sp.area && isGroup(sp.area) ? sp.area : "";
  const unreadOnly = !allView && sp.unread === "1";
  const search = allView ? (sp.q ?? "").trim() : "";
  const pageNum = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const where: Prisma.EmailLogWhereInput = {
    AND: [
      allView ? allListedWhere() : sentToWhere(me),
      area ? { type: { in: typesInGroup(area) } } : {},
      unreadOnly ? { reads: { none: { userEmail: me } } } : {},
      search
        ? { OR: [{ subject: { contains: search, mode: "insensitive" } }, { to: { has: search.toLowerCase() } }, { cc: { has: search.toLowerCase() } }] }
        : {},
    ],
  };

  const [emails, total, unread] = await Promise.all([
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        type: true,
        subject: true,
        to: true,
        cc: true,
        bcc: true,
        reads: { where: { userEmail: me }, select: { id: true }, take: 1 },
      },
    }),
    prisma.emailLog.count({ where }),
    unreadCount(me),
  ]);

  const todayKey = nyDayKey(new Date());
  const weekAgoKey = nyDayKey(new Date(Date.now() - 6 * 86_400_000));
  const sections: { title: string; rows: typeof emails }[] = [
    { title: "Today", rows: [] },
    { title: "This week", rows: [] },
    { title: "Earlier", rows: [] },
  ];
  for (const e of emails) {
    const k = nyDayKey(e.createdAt);
    sections[k === todayKey ? 0 : k >= weekAgoKey ? 1 : 2].rows.push(e);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (next: { view?: string; page?: number }) => {
    const p = new URLSearchParams();
    const view = next.view ?? (allView ? "all" : "");
    if (view) p.set("view", view);
    if (area) p.set("area", area);
    if (unreadOnly && view !== "all") p.set("unread", "1");
    if (search && view === "all") p.set("q", search);
    if (next.page && next.page > 1) p.set("page", String(next.page));
    const s = p.toString();
    return `/erp/inbox${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-pink-600">Notifications</h1>
        <InfoTip text="Emails the ERP has sent you, newest first. Click one to see it exactly as sent. Sign-in codes aren't listed." />
        {unread > 0 && <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700">{unread} unread</span>}
        <div className="ml-auto">{unread > 0 && <MarkAllReadButton />}</div>
      </div>

      {canSeeAllEmails(auth) && (
        <nav className="flex gap-1 border-b border-gray-200" aria-label="Notification views">
          {[
            { id: "", label: "My emails" },
            { id: "all", label: "All emails" },
          ].map((t) => {
            const active = (t.id === "all") === allView;
            return (
              <Link
                key={t.id}
                href={href({ view: t.id })}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                  active ? "border-pink-600 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}

      <InboxFilters allView={allView} area={area} unreadOnly={unreadOnly} q={search} areas={NOTIFICATION_GROUPS} />

      {emails.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {unreadOnly ? "You're all caught up." : allView ? "No emails match." : "No emails sent to you yet."}
        </p>
      ) : (
        sections
          .filter((s) => s.rows.length)
          .map((s) => (
            <section key={s.title}>
              <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">{s.title}</h2>
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
                {s.rows.map((e) => {
                  const { label, group } = emailMeta(e.type);
                  const mine = e.to.includes(me) || e.cc.includes(me) || e.bcc.includes(me);
                  const isUnread = mine && e.reads.length === 0;
                  const recipients = [...e.to, ...e.cc];
                  return (
                    <li key={e.id}>
                      <Link href={`/erp/inbox/${e.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                        <span className="mt-1.5 flex w-2 shrink-0 justify-center" aria-label={isUnread ? "Unread" : undefined}>
                          {isUnread && <span className="h-2 w-2 rounded-full bg-pink-500" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm ${isUnread ? "font-semibold text-gray-900" : "text-gray-700"}`}>{e.subject}</span>
                          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${group ? AREA_DOT[group] : "bg-gray-300"}`} />
                            <span className="shrink-0">{label}</span>
                            {allView && (
                              <span className="truncate text-gray-400" title={recipients.join(", ")}>
                                to {recipients[0] ?? "bcc only"}
                                {recipients.length > 1 ? ` +${recipients.length - 1}` : ""}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">{shortWhen(e.createdAt, todayKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Page {pageNum} of {pages}, {total} emails
          </span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link href={href({ page: pageNum - 1 })} className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50">
                Newer
              </Link>
            )}
            {pageNum < pages && (
              <Link href={href({ page: pageNum + 1 })} className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50">
                Older
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
