/** Split out from shiftResponses.ts (which imports `prisma` and other
 * server-only code) so a client component like SchedulePlanner.tsx can
 * import just this flag without pulling a server-only module into the
 * browser bundle. shiftResponses.ts re-exports this same constant for
 * server-side callers, so there's still exactly one source of truth. */

/** Single kill switch for the whole shift accept/decline feature — flip to
 * `true` to bring it back. While `false`: invite emails go out with no
 * Accept/Decline buttons (same as before this feature existed), the
 * supervisor dashboard shows no respond control, the calendar shows no
 * status dots, and the public /shift-response/[token] page + both respond
 * API routes 404/disable themselves even if someone has an old emailed
 * link. Nothing about the schema, stored tokens, or already-recorded
 * responses is touched — this only gates whether the feature is
 * *visible/reachable*, so turning it back on picks up right where it left off. */
export const SHIFT_RESPONSE_ENABLED = false;
