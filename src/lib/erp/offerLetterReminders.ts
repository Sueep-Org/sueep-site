/**
 * Morning reminder for offer letters due back tomorrow: sent, not signed,
 * declined or voided, with tomorrow as the sign-by date. Each letter only
 * matches on one morning, so it's reminded once. One email per sender,
 * listing their letters.
 */

import { prisma } from "@/lib/prisma";
import { buildOfferLetterDueEmail, sendEmail } from "@/lib/email";
import { todayEasternKey } from "./dates";
import { addDaysKey } from "./managementCalendar";
import { formatOfferDate, parseOfferValues } from "./offerLetters";

export async function sendOfferLetterReminders(todayKey: string = todayEasternKey()) {
  const tomorrow = addDaysKey(todayKey, 1);
  // signByDate is stored at noon UTC on the day (signByDateOf), so the whole UTC day covers it.
  const letters = await prisma.offerLetter.findMany({
    where: {
      status: "SENT",
      sentBy: { not: null },
      signByDate: { gte: new Date(`${tomorrow}T00:00:00Z`), lt: new Date(`${addDaysKey(tomorrow, 1)}T00:00:00Z`) },
    },
    select: { id: true, sentBy: true, values: true, candidate: { select: { id: true, fullName: true } } },
  });
  if (!letters.length) return { sent: 0, letters: 0 };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const bySender = new Map<string, typeof letters>();
  for (const l of letters) bySender.set(l.sentBy!, [...(bySender.get(l.sentBy!) ?? []), l]);

  const results = await Promise.allSettled(
    [...bySender].map(([to, list]) =>
      sendEmail({
        type: "OFFER_LETTER_DUE",
        to,
        link: list.length === 1 ? `/erp/candidates/${list[0].candidate.id}/offer-letter/${list[0].id}` : undefined,
        subject: list.length === 1 ? `Offer letter due back tomorrow: ${list[0].candidate.fullName}` : `${list.length} offer letters due back tomorrow`,
        html: buildOfferLetterDueEmail({
          letters: list.map((l) => ({
            name: l.candidate.fullName,
            title: parseOfferValues(l.values).title,
            signBy: formatOfferDate(tomorrow, "long"),
            url: `${appUrl}/erp/candidates/${l.candidate.id}/offer-letter/${l.id}`,
          })),
        }),
      }),
    ),
  );
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) console.error(`offer letter reminders: ${failed} email(s) failed`);
  return { sent: results.length - failed, letters: letters.length };
}
