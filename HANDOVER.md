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
| **QuickBooks** connection | Nightly P&L + A/R sync, invoices | Connected through **Edwin's** QuickBooks login. The ERP shows "connected by emma@" because it records the ERP user who clicked Connect, not the QuickBooks login | n/a |
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

> ⚠️ **Never rotate `ERP_ENCRYPTION_KEY`** unless you first write and test a script that decrypts everything with the old key and re-encrypts it with the new one. SSNs, bank numbers, Sueep Info logins and QuickBooks tokens are encrypted with it (`src/lib/erp/secretBox.ts`). A new key makes all of them unreadable, permanently.

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

There are **21** (`vercel.json`; earlier notes said 19). Each one is `src/app/api/cron/<name>/route.ts` and needs `Authorization: Bearer $CRON_SECRET`, which Vercel sends. All are safe to re-run.

Vercel only schedules in UTC. Since Nov 23 the **daytime** jobs (the ones that email people) are listed at both UTC hours their Eastern time can fall on, and only the run that matches the Eastern hour does any work (`src/lib/erp/cronEastern.ts`). So they go out at the same Eastern time all year, and the other run returns `{ skipped }`. The overnight jobs (`recurring-contracts`, `quickbooks-sync`, `employee-inactivity-check`, `delete-denied-candidates`, `email-log-cleanup`) are still plain UTC; an hour's shift doesn't matter for them.

Run one by hand: `curl -H "Authorization: Bearer $CRON_SECRET" "https://app.sueep.com/api/cron/<name>?force=1"` (`?force=1` skips the Eastern-hour check). History and logs: Vercel → Settings → Cron Jobs.

**Money and data syncs (fix these first):**

| Job | When | What breaks if it stops |
|---|---|---|
| `recurring-contracts` | daily 06:00 | Janitorial contracts get no new monthly billing period, so **those months aren't billed**. Catches up on the next run |
| `quickbooks-sync` | daily 09:30 | Finance dashboard overhead, A/R check and paid dates go stale. If QuickBooks needs reconnecting, it does nothing and the ERP shows a banner |
| `hubspot-invoice-sync` | every 15 min | Paid HubSpot invoices aren't applied to ERP billing lines, so **invoices look unpaid** |
| `hubspot-unit-invoices` | hourly :20 | Units, SOV lines and change orders don't get their invoices or Paid status |
| `hubspot-walk-dates` | hourly :40 | Job walks booked in HubSpot don't show on the management calendar |
| `deal-stage-steps` | hourly :50 | Deals moved in HubSpot don't get their automatic next step; followers aren't told |

**Field operations:**

| Job | When | What breaks if it stops |
|---|---|---|
| `schedule-nudge-morning` | daily 8:00 ET (12 & 13 UTC) | PMs aren't warned about active projects with nobody scheduled today |
| `schedule-nudge-midday` | daily 1pm ET (17 & 18 UTC) | No follow-up nudge for still-unscheduled projects |
| `schedule-confirmations` | daily 2pm ET (18 & 19 UTC) | No list of people scheduled tomorrow who haven't confirmed |
| `sub-check-ins` | every 15 min | Subs who didn't check in by their start time aren't flagged |
| `sub-offers` | hourly :10 | Sub job offers never expire; the sender isn't told |
| `sub-co-reminders` | weekdays 9:35 ET (13 & 14 UTC) | Property managers aren't reminded about unanswered sub change orders |
| `turnover-completion-digest` | daily 7pm ET (23 & 0 UTC) | Property managers stop getting the daily "units completed" email. Catches up on the next run |
| `property-manager-weekly` | Mon 7:30 ET (11 & 12 UTC) | Property managers don't get their weekly turnover list |
| `property-manager-reminders` | weekdays 9:30 ET (13 & 14 UTC) | Property manager requests waiting over a business day aren't escalated to staff |

**Office, people and housekeeping:**

| Job | When | What breaks if it stops |
|---|---|---|
| `management-reminders` | daily 8:00 ET (12 & 13 UTC) | No calendar reminders, quality check emails, **lien alerts**, billing cutoff warnings, Monday pipeline follow-ups, or pipeline snapshots (the weekly summary gets gaps) |
| `offer-letter-reminders` | daily 8:05 ET (12 & 13 UTC) | Senders aren't reminded the day before an offer letter is due back |
| `employee-inactivity-check` | daily 08:00 | Employees with no logged labor stay Active (payroll and lists get cluttered) |
| `delete-denied-candidates` | daily 07:00 | Denied field candidates (and their documents) are kept past 30 days |
| `email-failure-alert` | daily 9:00 ET (13 & 14 UTC) | **Nobody hears about failed emails.** This is your early warning for Resend problems |
| `email-log-cleanup` | daily 09:30 | Email Log grows; nothing user-facing breaks (project emails are always kept) |

If **every** cron fails at once, suspect `CRON_SECRET` (changed without a redeploy) or a broken deploy, not the jobs themselves.

## 5. Reconnecting QuickBooks

Who: an ERP **Admin** who is also a **QuickBooks admin** for the Sueep company. Business Managers can view and sync, but can't connect.

1. ERP → **QuickBooks** (`app.sueep.com/quickbooks`).
2. Click **Connect QuickBooks** or **Reconnect QuickBooks**. The card turns amber with "Needs reconnecting" when the token was revoked or expired.
3. Sign in to Intuit, pick the Sueep company, approve. You return to the QuickBooks page showing **Connected**.
4. Click sync, or wait for `quickbooks-sync` at 09:30 UTC, and check that the Finance dashboard numbers update.

If the Intuit app's keys changed: update `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` in Vercel, **redeploy**, then reconnect. `QBO_REDIRECT_URI` must exactly match a redirect URI on the Intuit app (`https://app.sueep.com/api/erp/quickbooks/callback`).

**Current state (Nov 19):** the Intuit app is on contact@, and production QuickBooks is connected through Edwin's QuickBooks login. The last sync on Nov 19 was OK. If the person whose QuickBooks login authorized the connection loses access to the company, expect a reconnect.

## 6. Open post-deploy steps (checked against the live database, Nov 19)

| Step | Status | What to do |
|---|---|---|
| Unapplied migrations | ✅ **None.** 151 of 151 applied | n/a |
| Jennifer's role switch | ✅ **Done.** jennifer@ is `BUSINESS_MANAGER` | n/a |
| `scripts/encrypt-pii.ts --apply` | ✅ **Done Nov 19.** 16 values encrypted (4 employees, 2 contractors, 2 candidates); a re-run finds 0 | n/a |
| `scripts/convert-work-order-contacts.ts --apply` | ✅ **Done Nov 19.** 12 job briefs, 18 contacts, 3 lines to notes; a re-run finds 0 | n/a |
| Email Settings recipients | ✅ **Done Nov 19.** Safety escalation goes to edwin@ and jennifer@. emma@ was removed from Turnovers completed (cc contact@ remains) and Management reminders (Edwin, David, Jennifer) | The code defaults in `src/lib/notificationTypes.ts` match (emma@ removed) |
| QuickBooks on a company login | ✅ **Done.** Connected through Edwin's QuickBooks login | n/a |

Both scripts skip rows that are already done, so re-running them is harmless.

## 7. When things break

| Symptom | Look at | Usual cause / fix |
|---|---|---|
| Deploy fails | Vercel build log | Usually a migration error. Fix it with a new migration, never by editing an applied one. `migrate status` shows which one |
| Deploy fails: migration "already exists" | `npx prisma migrate status` | Someone ran SQL with `db execute` but didn't run `migrate resolve --applied <folder>`. Run that, then redeploy |
| Site is down or broken after a deploy | Vercel → Deployments | **Promote** the last good deployment, then debug |
| "Reconnect QuickBooks" banner | ERP → QuickBooks | Token expired or revoked. Section 5 |
| Invoices not showing paid | Vercel cron logs for `hubspot-invoice-sync` / `hubspot-unit-invoices` | HubSpot token revoked/rotated (update `HUBSPOT_ACCESS_TOKEN`, redeploy) or HubSpot API errors |
| New HubSpot deals don't become ERP projects | ERP → HubSpot sync (`/erp/hubspot`, PM/Business Manager/Admin) shows which deals would sync | Deals sync when HubSpot's webhook fires, not on deploy or a timer. Check `HUBSPOT_ACCESS_TOKEN`, and `HUBSPOT_PIPELINE_STAGE_MAP` (pipeline and stage IDs, see `.env.example`; `/api/erp/hubspot/pipelines` lists the IDs while signed in). For janitorial, leave `workCompleted` empty to keep only active deals. **Sync deals from HubSpot** on that page runs it by hand |
| Emails not arriving | ERP → Admin → Email Settings → Email Log; resend.com logs | Resend key, domain DNS for `mail.sueep.com`, or the recipient was changed on Email Settings |
| All crons 401 | Vercel cron logs | `CRON_SECRET` changed without a redeploy |
| Nobody can sign in | Firebase console; `ERP_SESSION_SECRET` | Firebase config, or the session secret changed (everyone is signed out once, which is expected) |
| SSNs / Sueep Info logins show garbage or errors | `ERP_ENCRYPTION_KEY` | The key changed or is missing. Put the original value back. There is no other recovery |
| Stripe checkout fails | Stripe dashboard → webhooks | `STRIPE_*` keys or webhook secret |

## 8. How things work now (changes from Nov 23)

A cleanup pass on Emma's last week. Full list and what's still open: `UX_CLEANUP_PLAN.md` in `sueep-plans`.

**Renamed in the app:** Company Info is now **Sueep Info** (URL still `/erp/company-info`). Notifications settings are **Email Settings** (the inbox is still "Notifications"). Janitorial Contracts is **Janitorial**. Contractor Verification is **Contractors**. The turnover segment shows as **Unit turnovers** (stored value still `JANITORIAL_TURNOVER_REQUESTS`).

**Who gets a building's emails.** The turnover completion digest, the new turnover email, sub change order approvals and janitorial visit summaries go to the building's **active linked property managers** (Property Managers page). The typed-in contact on the building (`Building.pmName/pmEmail/pmPhone`, labelled "Building contact") is only a fallback when nobody is linked. One helper decides this: `buildingPropertyManagers()` in `src/lib/erp/propertyManagers.ts`. **Still to do:** staff link each building's contact (Property Managers → + Add shows them as "From buildings" suggestions). Once every building is linked, remove the building contact inputs and drop those three columns in a migration. No records were created automatically, because a property manager record gets a portal link and the Monday email.

**Finishing work.**
- The Schedule marks single days: **Mark day complete** (table `ScheduleDayCompletion`, API `/api/erp/schedule/day-completions`). It can also mark that day's SOV lines (`src/lib/erp/sovComplete.ts`) or a turn's scope items (`src/lib/erp/turnoverScopeServer.ts`). Those helpers hold the same rules the project page uses, so keep both pages going through them.
- A whole job (anything but a unit turn) is finished only with **Mark job complete** at the top of the project page. Unit turns and change orders can also be finished from their Schedule card. A turn still needs its quality checklist done (the API enforces it).
- Chips: ✓ and faded = day complete; solid green circle = whole job complete (every day counts as done).
- Change orders are created only on a project's Change Orders tab (not from New Project).

**Billing.** The QuickBooks / HubSpot (backup) invoice switch is on the **QuickBooks** page (Admin only), not Ready to Send. Auto-draft and the invoice label are set per janitorial contract on its **Billing** tab; the Janitorial list has an Auto-draft column.

**Access.** Only Admin, PM, Business Manager and Sales can assign or move people on the Schedule (`canAssignSchedule`; every assignment route checks it through `src/lib/erp/scheduleAccess.ts`, and others see the schedule read-only). Labor can be added or changed by everyone except Employees (`canEditLabor`, on every labor route). Page access comes from the helpers in `src/lib/erpAuth.ts`, plus section guards in `layout.tsx` files (Project Billing, Employees, Recruitment). Before Nov 23, Project Billing, Employees, Recruitment and Contractors were only hidden by the menu. The **Role Permissions** table on User Management (`PERMISSION_ROWS` in `src/app/erp/(shell)/users/UsersTable.tsx`) is written by hand: when you change who can do something, change the code first, then that table and `src/content/help/people/roles-and-permissions.tsx`.

**Help Center.** Articles are registered in `src/content/help/registry.ts`. Each has a `keywords` list (synonyms and terms from the article) that search uses with the title and description. Give every new article some keywords, or it's only found by its title.

## 9. Open work and known issues

Details and next phases are in each plan in `sueep-plans` (see its README status table).

**Sprint (SPRINT_NOV_2026.md):**
1. **Invoicing only through the ERP (QuickBooks cutover).** The production switch (now on the QuickBooks page, Admin only) is already on **QuickBooks** (AppSetting `qboInvoiceDrafts.production=true`, next number 1412, checked Nov 19). Still open: the Intuit app questionnaire set to "writes data", and Edwin confirming HubSpot's own invoice sync is off. After that, remove the HubSpot backup drafting path and the "until the cutover" notes in help articles.
2. **Change order contracts in the ERP.** Email PDF + upload the signed copy is built. Next: a signing link from the ERP.
3. **Business settings page.** Phases 1, 2, 3, 4A, 5 and 6 are built; 4B waits on "Save all" in production. See SETTINGS_PLAN.md.

**Plans with a next phase:** QuickBooks (Phase 3), Sub portal (Phase 5, check-in with location), Invoice tracking (Phases 7 and 8, retainage and lien waivers: waiting on business answers), ERP→QBO invoicing (waiting on 9 bookkeeper decisions), Office hiring (Phase 3), Security review (area 2 onward), HubSpot deals and Win insights (not started), Sub proposals Phase 5 (waiting for a go-ahead), Pipeline extras Phase 9 (after HubSpot deals Phase 3). Estimator storage 4c/6 is in the estimator repos.

**Known issues:**
- The default email recipients in `src/lib/notificationTypes.ts` (david@/jennifer@/edwin@) only apply to emails nobody has saved on Email Settings. Click **Save defaults** there (live site) so every list lives in the database, then change people on that page.
- **Notify about new projects and change orders** (Email Settings) starts as the people the ERP always picked (Sergio, David Rodriguez, Jennifer Cortes-Loya, found by name) until someone saves it. Save it once so it's a plain email list.
- Building contact fields are still read as a fallback for emails (section 8) until every building is linked to a property manager.
- Contractor notes, scope and job titles go to subs exactly as typed. Only the app's fixed wording is translated to Spanish (`src/lib/erp/language.ts`).
- Help Center screenshots (`public/help/`) show the old sidebar and some old forms.
- Local dev and production share one database (see section 3).
- The old import files (`pm-dashboard.xlsx`, `turns-rows.json`, `turns-import-report.json`, `build.log`) were removed Nov 19. They held client building names, worker names and pay rates, and are still in git history.
- Old branches (`estimator-updates`, `erp-changes`, `feature/*`, `app`) are stale. `main` is the source of truth.
- The `sueep-plans` README marks several features "not committed". They are all merged into `main` now, so read those notes as out of date.

## 10. After Emma leaves: secrets to rotate

Emma had every value below in local env files. Rotate them after Nov 25. How to rotate each one, and its side effects: [DEPLOYMENT_CHECKLIST.md → Rotating secrets](DEPLOYMENT_CHECKLIST.md#rotating-secrets).

- `CRON_SECRET`
- `ERP_SESSION_SECRET` (signs everyone out once)
- `HUBSPOT_ACCESS_TOKEN` and `HUBSPOT_CLIENT_SECRET`
- `QBO_CLIENT_SECRET` (then reconnect QuickBooks)
- `RESEND_API_KEY`, `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`, `META_ADS_ACCESS_TOKEN`, `DOCUSEAL_API_KEY`
- `DATABASE_URL` / `DIRECT_URL` (Neon role password)
- Sueep Info logins stored inside the ERP (change them at each site, then in the ERP)
- `ERP_ACCESS_PASSWORD`: **delete it** instead of rotating, because nothing uses it
- Estimator repo keys (OpenAI, Azure, Google Maps, Roboflow, BuildingConnected) if Emma had them

**Do not rotate `ERP_ENCRYPTION_KEY`** (section 2).

Also on the last day: set Emma's ERP user to **inactive** (don't delete it, because a lot of history points to it), and delete the "Emma Mazzoni" test property manager record.
