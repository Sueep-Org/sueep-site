# Sueep site + ERP

One Next.js app that serves two things:

| Host | What it is |
|---|---|
| `sueep.com` | Marketing site: services pages, blog, quote and lead forms, residential painting checkout (Stripe), careers and franchise forms |
| `app.sueep.com` | The **ERP**: projects, turnovers, scheduling, billing, payroll, people, subs, pipeline, finance. `src/middleware.ts` rewrites `app.sueep.com/x` to `/erp/x` |

Some pages on `app.sueep.com` need no login, because the link itself is the key: `/clock/` (janitor clock-in), `/pm/` (property manager calendars), `/sub/` (sub portal), `/schedule-response/`, `/co-request/`, `/co-approve/`, `/coi-request/`.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind 4 · Prisma 5 on Neon Postgres · Firebase Auth + Storage · Resend (email) · Vercel (hosting + crons).

Related docs:
- [HANDOVER.md](HANDOVER.md): start here if you're new: owners, open steps, what each cron breaks, what to do when things break.
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md): how to deploy, run migrations, roll back, and rotate secrets.
- [META_ADS_SETUP.md](META_ADS_SETUP.md): the Meta ads connection behind the ERP's Ad spend page.
- [.env.example](.env.example): every environment variable, what it does, and which ones are required.
- In-app help articles for staff live in `src/content/help/` (registered in `registry.ts`, shown at `/erp/help`).

---

## Run it locally

```bash
npm install            # also runs prisma generate
cp .env.example .env.local
# fill in values (or: vercel env pull .env.local), then move the DB + QBO + ERP_ENCRYPTION_KEY lines into .env
npm run dev
```

- Marketing site: http://localhost:3000
- ERP: http://localhost:3000/erp, or http://app.localhost:3000 to test the subdomain rewrite.
- Sign in with a Firebase email/password user. Emails in `ERP_ADMIN_EMAILS` become ADMIN automatically. Everyone else starts as EMPLOYEE and an Admin changes their role on the Users page.

**Why two env files?** The Prisma CLI (`prisma migrate`, `prisma studio`) only reads `.env`. Next.js reads both, and `.env.local` wins. So the database URLs, `ERP_ENCRYPTION_KEY` and the `QBO_*` keys live in `.env`, and everything else lives in `.env.local`. Both files are git-ignored.

## Database and migrations

> **Local dev and the live site share one Neon database today.** Anything you do locally (test records, scripts, migrations) happens to real data.

To get a separate database, run `docker compose up -d` and point both URLs at `postgresql://postgres:postgres@localhost:5432/sueep_erp`, or create a Neon branch.

Rules for this shared database:
- Add a migration by writing a new folder in `prisma/migrations/` (`YYYYMMDDHHMMSS_name/migration.sql`) that only adds things: new tables, new nullable columns, new indexes. Update `prisma/schema.prisma` to match.
- Apply it with `npx prisma migrate deploy`. Do not use `migrate dev`. It wants a shadow database and may offer to reset.
- If you ran SQL yourself with `npx prisma db execute --file ...`, tell Prisma it's done: `npx prisma migrate resolve --applied <migration_folder_name>`.
- **Never** run `prisma migrate reset`, `db push --force-reset`, or use the real database URL as a shadow database.
- `npm run build` runs `prisma migrate deploy` first, so **every Vercel deploy applies pending migrations** to the live database.
- Get the business's OK before any script or SQL that rewrites existing data.

`prisma/migrations_archive_pre_baseline/` holds old migrations from before the schema was re-baselined. It is history only, and Prisma doesn't read it. `prisma/data-migrations/` holds one-off data SQL.

## Deploying

Vercel builds and deploys the GitHub repo `Sueep-Org/sueep-site`. Day-to-day work happened on the `estimator-emma` branch and was merged into `main` through pull requests. Full steps, rollback and post-deploy checks are in [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md).

## Code map

```
src/
  middleware.ts          app.sueep.com rewrite + ERP login check
  app/
    (marketing)/         public website pages
    erp/                 ERP pages; erp/(shell)/ is everything behind the nav
    api/erp/             ERP API routes (role-checked)
    api/cron/            scheduled jobs (see below)
    api/integrations/    HubSpot webhook
    api/webhooks/        Stripe webhook
    api/external/        project requests from outside forms
    clock, pm, sub, co-request, co-approve, schedule-response, coi-request ...
                         public token-link pages
  lib/
    erp/                 most business logic (billing, payroll, QuickBooks, Meta, secretBox ...)
    hubspot/             HubSpot sync code
    email.ts             every email goes through sendEmail (Notifications settings + Email Log)
    notificationTypes.ts list of every email, its recipients and defaults
    erpSession.ts, erpAuth.ts, erpRoles.ts   sessions and role checks
  content/help/          in-app help articles
prisma/schema.prisma     the data model
scripts/                 one-off and maintenance scripts (see below)
```

**Roles** (`src/lib/erpSession.ts`): ADMIN, PROJECT_MANAGER, BUSINESS_MANAGER, SALES, SUPERVISOR, ESTIMATION, EMPLOYEE.

**Encryption:** SSNs, bank numbers, Company Info logins and QuickBooks tokens are encrypted with `ERP_ENCRYPTION_KEY` (`src/lib/erp/secretBox.ts`). If that key is lost or changed, those values can't be read again. Don't rotate it unless you also write a re-encrypt script.

## Integrations

| Service | Used for | Where it's set up | Env vars |
|---|---|---|---|
| **Neon** | Postgres database | console.neon.tech | `DATABASE_URL`, `DIRECT_URL` |
| **Vercel** | Hosting, env vars, crons | vercel.com (team for contact@sueep.com) | sets `VERCEL_ENV`, `VERCEL_URL` |
| **Firebase** | ERP sign-in (email/password), file uploads (Storage) | console.firebase.google.com | `NEXT_PUBLIC_FIREBASE_*` |
| **Resend** | All outgoing email, sent from `noreply@mail.sueep.com` | resend.com | `RESEND_API_KEY`, `RESEND_FROM` |
| **QuickBooks Online** | Nightly P&L and A/R sync, invoices sent to QuickBooks | Intuit Developer app; connect from ERP → QuickBooks | `QBO_*` |
| **HubSpot** | Deals ↔ projects, invoice and payment sync, walk dates, webhook | HubSpot private app | `HUBSPOT_*` |
| **Stripe** | Website residential painting checkout | dashboard.stripe.com; webhook to `/api/webhooks/stripe` | `STRIPE_*` |
| **Meta** | Ad spend page | See [META_ADS_SETUP.md](META_ADS_SETUP.md) | `META_*` |
| **DocuSeal** | Legacy: real estate agreement signing only. Change order contracts are now made in the ERP | docuseal.com | `DOCUSEAL_*` |

**Reconnecting QuickBooks:** if the ERP shows a "reconnect QuickBooks" banner (the token was revoked or expired), a QuickBooks admin opens ERP → QuickBooks and clicks Connect. The next nightly sync confirms it worked. If the Intuit app's keys change, update `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` in Vercel, redeploy, and then reconnect. `QBO_REDIRECT_URI` must exactly match a Redirect URI on the Intuit app.

**Who gets emails:** most recipients are set on the ERP **Notifications** page (Admin). Env values like `SAFETY_ESCALATION_EMAIL` are only starting defaults. Check that page when people join or leave, because some defaults still point at former staff. Every sent or failed email is listed in the Email Log.

## Scheduled jobs (Vercel crons)

Defined in `vercel.json`. Each route is in `src/app/api/cron/<name>/route.ts` and rejects any request without `Authorization: Bearer $CRON_SECRET`, which Vercel adds automatically. Times are fixed UTC, so they shift an hour against Eastern time with daylight saving.

| Job | Schedule (UTC) | What it does |
|---|---|---|
| `recurring-contracts` | daily 06:00 | Creates each month's billing period for active recurring (janitorial) contracts |
| `delete-denied-candidates` | daily 07:00 | Deletes field candidates still DENIED 30+ days after applying |
| `employee-inactivity-check` | daily 08:00 | Flags Active employees with no logged labor as Inactive and emails a digest |
| `quickbooks-sync` | daily 09:30 | Reads the QuickBooks P&L and A/R Aging into the ERP |
| `email-log-cleanup` | daily 09:30 | Deletes Email Log entries older than 180 days |
| `property-manager-weekly` | Mon 11:30 | Emails each property manager their turnovers for the week |
| `schedule-nudge-morning` | daily 12:00 | Emails PMs about active projects with nobody scheduled today |
| `management-reminders` | daily 12:00 | Management calendar reminders, quality checks, lien alerts, billing cutoffs |
| `offer-letter-reminders` | daily 12:05 | Reminds the sender the day before an offer letter is due back |
| `email-failure-alert` | daily 13:00 | Emails Admins if any emails failed in the last day |
| `property-manager-reminders` | weekdays 13:30 | Reminds staff about property manager requests waiting over a business day |
| `sub-co-reminders` | weekdays 13:35 | Reminds property managers about unanswered sub change orders |
| `schedule-nudge-midday` | daily 17:00 | Follow-up nudge if projects are still unscheduled |
| `schedule-confirmations` | daily 18:00 | Lists who is scheduled tomorrow and hasn't confirmed |
| `turnover-completion-digest` | daily 23:00 | Emails property managers the turnover units completed since the last digest |
| `hubspot-invoice-sync` | every 15 min | Applies paid HubSpot invoices to ERP billing lines (polling, since HubSpot has no invoice webhook) |
| `sub-check-ins` | every 15 min | Flags subs who haven't checked in by their start time |
| `sub-offers` | hourly :10 | Expires sub job offers past their answer-by time and tells the sender |
| `hubspot-unit-invoices` | hourly :20 | Mirrors HubSpot invoices onto units, SOV lines and change orders; marks matches Paid |
| `hubspot-walk-dates` | hourly :40 | Fills deals' Job Walk Date from HubSpot meetings |
| `deal-stage-steps` | hourly :50 | Adds the automatic next step when a deal changes stage; notifies followers |

To run one by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://app.sueep.com/api/cron/<name>`. Vercel → Project → Settings → Cron Jobs shows run history and logs.

## Scripts

Run from the repo root. Almost every script is a **dry run by default** and only writes with `--apply`. Read the comment at the top of a script before you run it, because it runs against the live database.

| Script | Purpose |
|---|---|
| `npm run hubspot:pipelines` | Prints HubSpot pipeline and stage IDs for `HUBSPOT_PIPELINE_STAGE_MAP` |
| `scripts/encrypt-pii.ts` | Encrypts SSNs and bank numbers saved before encryption existed |
| `scripts/convert-work-order-contacts.ts` | Turns old job brief contact text into contact rows |
| `scripts/shrink-checklist-photos.ts` | Shrinks full-size turnover checklist photos and adds previews |
| `scripts/backfill-*`, `mark-park-square-paid.ts`, `seed-health-coverage.ts` | One-off data fixes already run; kept for reference |
| `scripts/import-*` | One-time imports from the old spreadsheets |

Typical invocation: `npx tsx --env-file=.env --env-file=.env.local scripts/<name>.ts` (`.mjs` files: `node --env-file=... scripts/<name>.mjs`).

## Handover notes (November 2026)

- **Branches:** `main` is the source of truth, and all of `estimator-emma` is merged into it (last merge: PR #162, 2026-11-12). Start new work from `main`. Old branches (`estimator-updates`, `erp-changes`, `feature/*`, `app`) are stale. A broken remote ref named `origin/estimator-emma 2` (with a space) makes `git fetch` fail, which leaves your local copy of `main` out of date without any obvious sign. Delete that branch on GitHub, or locally with `git update-ref -d "refs/remotes/origin/estimator-emma 2"`, then run `git fetch`.
- **Estimator:** the floor plan estimator was removed from this repo (commit `106bb0bf`). It lives in the separate `aiestimator-api` and `aiestimator-ui` repos. Leftover `ESTIMATOR_*` env vars in Vercel are unused and can be deleted, along with `ERP_ACCESS_PASSWORD` and `DOCUSEAL_CHANGE_ORDER_TEMPLATE_ID`.
- **Feature plans** (status of every in-progress feature, open decisions, next phases) live in the `sueep-plans` folder outside this repo. Move it to the company Drive, or into a `docs/` folder here, so it isn't lost.
- **Accounts to move to a company login:** the Intuit Developer app (QuickBooks keys), the Resend owner, Firebase owners, and LinkedIn page admins. Afterwards, update `DOCUSEAL_SUEEP_SIGNER_EMAIL` and `ERP_ADMIN_EMAILS` in Vercel, and check the recipients on the Notifications page.
- **Root data files** `pm-dashboard.xlsx`, `turns-rows.json`, `turns-import-report.json` and `build.log` are committed import leftovers. Check them for client data before removing them.
