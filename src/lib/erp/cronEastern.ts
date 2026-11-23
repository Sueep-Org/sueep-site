/**
 * Daytime crons are listed in vercel.json at both UTC hours an Eastern time
 * can land on (UTC-4 in summer, UTC-5 in winter), so each one fires twice a
 * day. Only the run whose Eastern hour matches does the work, so the email
 * goes out at the same local time all year. `?force=1` always runs, for
 * running a job by hand (see HANDOVER.md, section 4).
 */
export function runsNowAtEasternHour(req: Request, hour: number, now: Date = new Date()): boolean {
  if (new URL(req.url).searchParams.get("force") === "1") return true;
  const easternHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now),
  );
  return easternHour === hour;
}
