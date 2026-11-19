# ERP handover

Written November 2026 for the developer taking over `sueep-site` (sueep.com + app.sueep.com). Emma's last day is **Wed Nov 25, 2026** (employment ends Nov 27).

Read these with this file:
- [README.md](README.md): what the app is, code map, integrations, scripts, how to run it locally.
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md): deploy steps, rollback, how to rotate each secret.
- [.env.example](.env.example): every environment variable and what it does.
- Feature plans: the `sueep-plans` folder (status of each feature, open decisions, next phases). It now lives in the company's shared location.

This file covers what those don't: who owns what, what's still open, what breaks when a job stops, and what to do when something goes wrong.

---

## 1. Services and who owns them

Nothing the ERP needs should depend on Emma's login after Nov 25.

| Service | Used for | Owner / login | Emma after Nov 25 |
|---|---|---|---|
| **Vercel** | Hosting, env vars, crons, logs | Team on **contact@sueep.com** | Leaves the team |
| **GitHub** `Sueep-Org/sueep-site` | Code; Vercel deploys from `main` | Org owned by the **sueep** account | Leaves the org |
| **Neon** | Postgres (ERP database; the estimator has its own) | Company account (not Emma) | Login removed |
| **Resend** | All email, from `noreply@mail.sueep.com` | **contact@sueep.com** (owner + billing since Nov 19) | Leaves the team (account not deleted) |
| **Intuit Developer** app | QuickBooks Online keys (`QBO_*`) | **contact@sueep.com** | n/a |
| **QuickBooks** connection | Nightly P&L + A/R sync, invoices | Connected under Emma's QuickBooks login today. **Must be reconnected** by a company QuickBooks admin (section 5) | |
| **Firebase** | ERP sign-in, file storage | Other company owners exist | Removed on last day |
| **HubSpot** | Deals, invoices, walk dates, webhook | Company account. The private app token belongs to the account, not a user | Super admin removed on last day |
| **DocuSeal** | Legacy: real estate agreements only | Not Emma's account | Change `DOCUSEAL_SUEEP_SIGNER_EMAIL` (still Emma) |
| **Stripe** | Website residential painting checkout | Company account | Any login removed |
| **Meta** | Ad spend page (`erp-bot` system user token) | Company Business account | Any login removed |
| **Azure** | **Estimator only** (`aiestimator-api`/`-ui` repos): API hosting, storage, Vision, Foundry. Not used by this repo | Company tenant | User removed |

Estimator-only services (not this repo): OpenAI, BuildingConnected, Google Cloud (Maps), Roboflow, its own Neon database.

## 2. Environment variables

- **All values live in Vercel** → Project → Settings → Environment Variables. Edits only apply on the **next deploy**.
- Local: `vercel env pull .env.local`, then move `DATABASE_URL`, `DIRECT_URL`, `ERP_ENCRYPTION_KEY` and `QBO_*` into `.env` (the Prisma CLI reads only `.env`).
- `NEXT_PUBLIC_*` values are public in the browser. Never put a secret in one.

> ⚠️ **Never rotate `ERP_ENCRYPTION_KEY`** unless you first write and test a script that decrypts everything with the old key and re-encrypts it with the new one. SSNs, bank numbers, Company Info logins and QuickBooks tokens are encrypted with it (`src/lib/erp/secretBox.ts`). A new key makes all of them unreadable, permanently.

Cleanup you can do any time:
- Delete from Vercel: `ERP_ACCESS_PASSWORD`, `DOCUSEAL_CHANGE_ORDER_TEMPLATE_ID`, all `ESTIMATOR_*`. Nothing in `src/` reads them.
- Change `DOCUSEAL_SUEEP_SIGNER_EMAIL` off emma@, and remove emma@ from `ERP_ADMIN_EMAILS`.

## 3. Deploys and migrations

Full steps: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md). The short version:

1. Branch from `main`. Run `npm run lint` and `npx tsc --noEmit`.
2. PR into `main`, then merge. Vercel builds and deploys.
3. The build runs `prisma migrate deploy` first, **so every deploy (including preview deploys of any branch) applies pending migrations to the live database.**
4. Check: green build, sign in, open the page you changed, watch Vercel → Logs for a few minutes.
5. Rollback: Vercel → Deployments → last good one → **Promote to Production**. Migrations are not rolled back. Fix a bad migration with a new one.

**Local dev uses the live database.** Use `docker compose up -d` or a Neon branch when you want to experiment.

Migration rules (no exceptions):
- Migrations only **add**: new tables, nullable columns, indexes. Write the folder by hand: `prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`, and update `schema.prisma` to match.
- Apply with **`npx prisma migrate deploy`** only. Never `migrate dev`.
- If you ran SQL yourself with `npx prisma db execute --file ...`, **always** follow it with `npx prisma migrate resolve --applied <folder>`. Otherwise the next deploy tries to apply it again and fails.
- **Never** `prisma migrate reset` or `db push --force-reset`. **Never** use a real database URL as the shadow database.
- Check with `npx prisma migrate status`. It should say "Database schema is up to date".
- Get the business's OK before any script or SQL that changes existing data.

## 4. Scheduled jobs (Vercel crons)

There are **21** (`vercel.json`; earlier notes said 19). Each one is `src/app/api/cron/<name>/route.ts` and needs `Authorization: Bearer $CRON_SECRET`, which Vercel sends. Times are UTC, so they shift an hour against Eastern time when daylight saving changes. All are safe to re-run.

Run one by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://app.sueep.com/api/cron/<name>`. History and logs: Vercel → Settings → Cron Jobs.

**Money and data syncs (fix these first):**

| Job | When (UTC) | What breaks if it stops |
|---|---|---|
| `recurring-contracts` | daily 06:00 | Janitorial contracts get no new monthly billing period, so **those months aren't billed**. Catches up on the next run |
| `quickbooks-sync` | daily 09:30 | Finance dashboard overhead, A/R check and paid dates go stale. If QuickBooks needs reconnecting, it does nothing and the ERP shows a banner |
| `hubspot-invoice-sync` | every 15 min | Paid HubSpot invoices aren't applied to ERP billing lines, so **invoices look unpaid** |
| `hubspot-unit-invoices` | hourly :20 | Units, SOV lines and change orders don't get their invoices or Paid status |
| `hubspot-walk-dates` | hourly :40 | Job walks booked in HubSpot don't show on the management calendar |
| `deal-stage-steps` | hourly :50 | Deals moved in HubSpot don't get their automatic next step; followers aren't told |

**Field operations:**

| Job | When (UTC) | What breaks if it stops |
|---|---|---|
| `schedule-nudge-morning` | daily 12:00 | PMs aren't warned about active projects with nobody scheduled today |
| `schedule-nudge-midday` | daily 17:00 | No follow-up nudge for still-unscheduled projects |
| `schedule-confirmations` | daily 18:00 | No list of people scheduled tomorrow who haven't confirmed |
| `sub-check-ins` | every 15 min | Subs who didn't check in by their start time aren't flagged |
| `sub-offers` | hourly :10 | Sub job offers never expire; the sender isn't told |
| `sub-co-reminders` | weekdays 13:35 | Property managers aren't reminded about unanswered sub change orders |
| `turnover-completion-digest` | daily 23:00 | Property managers stop getting the daily "units completed" email. Catches up on the next run |
| `property-manager-weekly` | Mon 11:30 | Property managers don't get their weekly turnover list |
| `property-manager-reminders` | weekdays 13:30 | Property manager requests waiting over a business day aren't escalated to staff |

**Office, people and housekeeping:**

| Job | When (UTC) | What breaks if it stops |
|---|---|---|
| `management-reminders` | daily 12:00 | No calendar reminders, quality check emails, **lien alerts**, billing cutoff warnings, Monday pipeline follow-ups, or pipeline snapshots (the weekly summary gets gaps) |
| `offer-letter-reminders` | daily 12:05 | Senders aren't reminded the day before an offer letter is due back |
| `employee-inactivity-check` | daily 08:00 | Employees with no logged labor stay Active (payroll and lists get cluttered) |
| `delete-denied-candidates` | daily 07:00 | Denied field candidates (and their documents) are kept past 30 days |
| `email-failure-alert` | daily 13:00 | **Nobody hears about failed emails.** This is your early warning for Resend problems |
| `email-log-cleanup` | daily 09:30 | Email Log grows; nothing user-facing breaks (project emails are always kept) |

If **every** cron fails at once, suspect `CRON_SECRET` (changed without a redeploy) or a broken deploy, not the jobs themselves.

## 5. Reconnecting QuickBooks

Who: an ERP **Admin** who is also a **QuickBooks admin** for the Sueep company. Business Managers can view and sync, but can't connect.

1. ERP → **QuickBooks** (`app.sueep.com/quickbooks`).
2. Click **Connect QuickBooks** or **Reconnect QuickBooks**. The card turns amber with "Needs reconnecting" when the token was revoked or expired.
3. Sign in to Intuit, pick the Sueep company, approve. You return to the QuickBooks page showing **Connected**.
4. Click sync, or wait for `quickbooks-sync` at 09:30 UTC, and check that the Finance dashboard numbers update.

If the Intuit app's keys changed: update `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` in Vercel, **redeploy**, then reconnect. `QBO_REDIRECT_URI` must exactly match a redirect URI on the Intuit app (`https://app.sueep.com/api/erp/quickbooks/callback`).

**Open now:** the app moved to contact@, but production is still connected through Emma's QuickBooks login (last sync Nov 19, OK). Before Nov 25: put the contact@ app's keys in Vercel, redeploy, have a company QuickBooks admin reconnect, and confirm the next nightly sync.

## 6. Open post-deploy steps (checked against the live database, Nov 19)

| Step | Status | What to do |
|---|---|---|
| Unapplied migrations | ✅ **None.** 151 of 151 applied | n/a |
| Jennifer's role switch | ✅ **Done.** jennifer@ is `BUSINESS_MANAGER` | n/a |
| `scripts/encrypt-pii.ts --apply` | ❌ **Pending.** Dry run: 16 plain-text values (4 employees, 2 contractors, 2 candidates) | Encryption is live, so this is safe to run. These are SSNs and bank numbers, so do it first. `npx tsx --env-file=.env --env-file=.env.local scripts/encrypt-pii.ts --apply` |
| `scripts/convert-work-order-contacts.ts --apply` | ❌ **Pending.** Dry run: 12 job briefs, 18 contacts, 3 lines to notes | Read the dry-run output first, then `npx tsx --env-file=.env --env-file=.env.local scripts/convert-work-order-contacts.ts --apply` |
| Notifications page recipients | ❌ **Pending.** emma@ is still saved on Safety escalation (only recipient), Turnovers completed (cc) and Management reminders | ERP → Notifications: pick replacements and save. The code defaults in `src/lib/notificationTypes.ts` also name emma@; update them when convenient |
| QuickBooks reconnect under company login | ❌ **Pending** | Section 5 |

Both scripts can safely be re-run: they skip rows that are already done.

## 7. When things break

| Symptom | Look at | Usual cause / fix |
|---|---|---|
| Deploy fails | Vercel build log | Usually a migration error. Fix it with a new migration, never by editing an applied one. `migrate status` shows which one |
| Deploy fails: migration "already exists" | `npx prisma migrate status` | Someone ran SQL with `db execute` but didn't run `migrate resolve --applied <folder>`. Run that, then redeploy |
| Site is down or broken after a deploy | Vercel → Deployments | **Promote** the last good deployment, then debug |
| "Reconnect QuickBooks" banner | ERP → QuickBooks | Token expired or revoked. Section 5 |
| Invoices not showing paid | Vercel cron logs for `hubspot-invoice-sync` / `hubspot-unit-invoices` | HubSpot token revoked/rotated (update `HUBSPOT_ACCESS_TOKEN`, redeploy) or HubSpot API errors |
| Emails not arriving | ERP → Email Log; resend.com logs | Resend key, domain DNS for `mail.sueep.com`, or the recipient was changed on the Notifications page |
| All crons 401 | Vercel cron logs | `CRON_SECRET` changed without a redeploy |
| Nobody can sign in | Firebase console; `ERP_SESSION_SECRET` | Firebase config, or the session secret changed (everyone is signed out once, which is expected) |
| SSNs / Company Info logins show garbage or errors | `ERP_ENCRYPTION_KEY` | The key changed or is missing. Put the original value back. There is no other recovery |
| Stripe checkout fails | Stripe dashboard → webhooks | `STRIPE_*` keys or webhook secret |

## 8. Open work and known issues

Details and next phases are in each plan in `sueep-plans` (see its README status table).

**Sprint (SPRINT_NOV_2026.md):**
1. **Invoicing only through the ERP (QuickBooks cutover).** The Admin switch is built. Waiting on: the Intuit app questionnaire set to "writes data", the new keys plus reconnect, and Edwin turning off HubSpot's invoice sync. After that, remove the HubSpot drafting path and the "until the cutover" notes in help articles.
2. **Change order contracts in the ERP.** Email PDF + upload the signed copy is built. Next: a signing link from the ERP.
3. **Business settings page.** Phases 1, 2, 3, 4A, 5 and 6 are built; 4B waits on "Save all" in production. See SETTINGS_PLAN.md.

**Plans with a next phase:** QuickBooks (Phase 3), Sub portal (Phase 5, check-in with location), Invoice tracking (Phases 7 and 8, retainage and lien waivers: waiting on business answers), ERP→QBO invoicing (waiting on 9 bookkeeper decisions), Office hiring (Phase 3), Security review (area 2 onward), HubSpot deals and Win insights (not started), Sub proposals Phase 5 (waiting for a go-ahead), Pipeline extras Phase 9 (after HubSpot deals Phase 3). Estimator storage 4c/6 is in the estimator repos.

**Known issues:**
- Local dev and production share one database (see section 3).
- Cron times are fixed UTC and drift by an hour with daylight saving.
- Some names are hardcoded in code: emma@/david@/jennifer@/edwin@ in `src/lib/notificationTypes.ts` defaults, and "Jennifer Cortes-Loya" name matching in project and change order forms. These break quietly when people leave.
- Root files `pm-dashboard.xlsx`, `turns-rows.json`, `turns-import-report.json`, `build.log` are old import leftovers. Check them for client data, then remove them.
- Old branches (`estimator-updates`, `erp-changes`, `feature/*`, `app`) are stale. `main` is the source of truth.
- The `sueep-plans` README marks several features "not committed". They are all merged into `main` now, so read those notes as out of date.

## 9. After Emma leaves: secrets to rotate

Emma had every value below in local env files. Rotate them after Nov 25. How to rotate each one, and its side effects: [DEPLOYMENT_CHECKLIST.md → Rotating secrets](DEPLOYMENT_CHECKLIST.md#rotating-secrets).

- `CRON_SECRET`
- `ERP_SESSION_SECRET` (signs everyone out once)
- `HUBSPOT_ACCESS_TOKEN` and `HUBSPOT_CLIENT_SECRET`
- `QBO_CLIENT_SECRET` (then reconnect QuickBooks)
- `RESEND_API_KEY`, `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, `META_ADS_ACCESS_TOKEN`, `DOCUSEAL_API_KEY`
- `DATABASE_URL` / `DIRECT_URL` (Neon role password)
- Company Info logins stored inside the ERP (change them at each site, then in the ERP)
- `ERP_ACCESS_PASSWORD`: **delete it** instead of rotating, because nothing uses it
- Estimator repo keys (OpenAI, Azure, Google Maps, Roboflow, BuildingConnected) if Emma had them

**Do not rotate `ERP_ENCRYPTION_KEY`** (section 2).

Also on the last day: set Emma's ERP user to **inactive** (don't delete it, because a lot of history points to it), and delete the "Emma Mazzoni" test property manager record.
