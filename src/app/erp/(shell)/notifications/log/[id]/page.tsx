import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { canManageNotifications, getErpAuth } from "@/lib/erpAuth";
import { NOTIFICATIONS, isEmailType } from "@/lib/notificationTypes";
import { STATUS_STYLE } from "../status";
import { ResendButton } from "./ResendButton";

export const metadata: Metadata = {
  title: "Email",
};

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function EmailLogDetailPage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManageNotifications(auth.role)) redirect("/erp");
  const { id } = await params;

  const log = await prisma.emailLog.findUnique({ where: { id } });
  if (!log) notFound();
  const resends = await prisma.emailLog.findMany({
    where: { resentFromId: log.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, status: true, sentBy: true },
  });

  const style = STATUS_STYLE[log.status] ?? STATUS_STYLE.SENT;
  const label = isEmailType(log.type) ? NOTIFICATIONS[log.type].label : log.type;
  const when = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  const canResend = !!log.html && !log.hasAttachments && log.status !== "SKIPPED";

  const facts: [string, React.ReactNode][] = [
    ["Email", label],
    ["Sent", when(log.createdAt)],
    ["To", log.to.join(", ") || "Nobody"],
    ...(log.cc.length ? [["Copy", log.cc.join(", ")] as [string, string]] : []),
    ...(log.bcc.length ? [["Bcc", log.bcc.join(", ")] as [string, string]] : []),
    ...(log.replyTo ? [["Replies go to", log.replyTo] as [string, string]] : []),
    ...(log.link
      ? [
          [
            "About",
            <Link key="about" href={log.link} className="text-pink-600 hover:underline">
              {log.link}
            </Link>,
          ] as [string, React.ReactNode],
        ]
      : []),
    ...(log.sentBy ? [["Resent by", log.sentBy] as [string, string]] : []),
  ];

  return (
    <div className="space-y-5">
      <Link href="/erp/notifications/log" className="text-sm text-gray-500 hover:text-gray-800">
        ← Email Log
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{log.subject}</h1>
          <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style.cls}`} title={style.hint}>
            {style.label}
          </span>
        </div>
        {canResend && <ResendButton id={log.id} recipients={[...log.to, ...log.cc].join(", ")} />}
      </div>

      {log.error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{log.error}</p>}
      {log.hasAttachments && (
        <p className="text-xs text-gray-500">This email had an attachment (like a calendar invite), which isn&apos;t kept, so it can&apos;t be resent from here.</p>
      )}

      <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm sm:grid-cols-[8rem_1fr]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-500">{k}</dt>
            <dd className="break-words text-gray-900">{v}</dd>
          </div>
        ))}
      </dl>

      {resends.length > 0 && (
        <div className="text-sm text-gray-600">
          Resent:{" "}
          {resends.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <Link href={`/erp/notifications/log/${r.id}`} className="text-pink-600 hover:underline">
                {when(r.createdAt)}
              </Link>{" "}
              ({(STATUS_STYLE[r.status] ?? STATUS_STYLE.SENT).label.toLowerCase()}
              {r.sentBy ? `, ${r.sentBy}` : ""})
            </span>
          ))}
        </div>
      )}

      {log.html ? (
        <iframe
          title="Email preview"
          srcDoc={log.html}
          sandbox=""
          className="h-[640px] w-full rounded-lg border border-gray-200 bg-white"
        />
      ) : (
        <p className="text-sm text-gray-500">The content of this email wasn&apos;t kept.</p>
      )}
    </div>
  );
}
