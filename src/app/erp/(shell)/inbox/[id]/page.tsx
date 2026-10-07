import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { allListedWhere, canSeeAllEmails, inboxEmail } from "@/lib/erp/inbox";
import { AREA_DOT, emailMeta, fullWhen } from "../areas";
import { MarkRead } from "./MarkRead";

export const metadata: Metadata = {
  title: "Notification",
};

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function InboxEmailPage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth) redirect("/erp/login");
  const me = inboxEmail(auth);
  const { id } = await params;

  const email = await prisma.emailLog.findFirst({
    where: { AND: [{ id }, allListedWhere()] },
    select: {
      id: true,
      createdAt: true,
      type: true,
      subject: true,
      to: true,
      cc: true,
      bcc: true,
      link: true,
      html: true,
      reads: { where: { userEmail: me }, select: { id: true }, take: 1 },
    },
  });
  const mine = !!email && (email.to.includes(me) || email.cc.includes(me) || email.bcc.includes(me));
  if (!email || (!mine && !canSeeAllEmails(auth))) notFound();

  const { label, group } = emailMeta(email.type);
  // Bcc stays hidden; a bcc'd person still sees the email, just not who else got it.
  const facts: [string, string][] = [
    ["Sent", fullWhen(email.createdAt)],
    ["To", email.to.join(", ") || "Not shown"],
    ...(email.cc.length ? [["Copy", email.cc.join(", ")] as [string, string]] : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {mine && email.reads.length === 0 && <MarkRead id={email.id} />}
      <Link href="/erp/inbox" className="text-sm text-gray-500 hover:text-gray-800">
        ← Notifications
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">{email.subject}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
            <span className={`h-2 w-2 rounded-full ${group ? AREA_DOT[group] : "bg-gray-300"}`} />
            {label}
            {group && <span className="text-gray-400">· {group}</span>}
          </p>
        </div>
        {email.link && (
          <Link href={email.link} className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-700">
            Open in ERP
          </Link>
        )}
      </div>

      <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm sm:grid-cols-[6rem_1fr]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-gray-500">{k}</dt>
            <dd className="break-words text-gray-900">{v}</dd>
          </div>
        ))}
      </dl>

      {email.html ? (
        <iframe title="Email" srcDoc={email.html} sandbox="" className="h-[640px] w-full rounded-lg border border-gray-200 bg-white" />
      ) : (
        <p className="text-sm text-gray-500">The content of this email wasn&apos;t kept.</p>
      )}
    </div>
  );
}
