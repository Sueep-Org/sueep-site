# Deals, Billing and Companies Plan

Phased plan for: a Business Manager role, client company records, auto-drafted invoices, invoice delivery, win/loss reports, and post-construction deal tools. Written 2026-10-15 from a brainstorm with leadership.

Shareable overview for leadership (charts, numbers, reasoning): https://claude.ai/artifact/6n3HSMJ5Mxg1feqy9PF3F1

**To start a new chat:** "Read DEALS_BILLING_PLAN.md and start Phase N." Each phase lists the questions that must be answered first. Ask the ones still open before writing code.

## Status (updated 2026-10-15)

| Phase | State |
|---|---|
| 0. Prep | HubSpot scopes added. Still open: required lost reason in HubSpot, change the reused portal password, save portal logins on Company Info. |
| 1. Business Manager | Built, committed (b21d08d). Jennifer is BUSINESS_MANAGER. |
| 2. Companies | Built, committed (b21d08d), seeded (11 companies, 13 buildings linked). |
| 3. Invoices | Built, committed (061441c). Janitorial auto-drafts + Ready to bill (pick finished work). Migrations applied. Not tested against HubSpot. |
| 4. Delivery | Built, NOT committed. Email on Approve (PDF + pay link, replies to approver), Needs sending list for portals and problems. Migration `20261015220000_invoice_delivery` not applied. Not tested. |
| 5. Win/loss | Built, NOT committed. No migration. Win/Loss page, GC scorecard on company pages, Stale quotes card (Sales tab: Sales, BM, Admin). Decisions: won = Quote Approved and later, keep HubSpot lost reasons, stale = 30 days, no monthly email, no big-loss flagging. |
| 6. Post-con tools | Not started. Includes the estimating calendar. |

**Decisions made while building (not in the original plan):**
- Model is `ClientCompany` (not `Company`). Portal logins live on Company Info > Logins and are linked to companies (`ClientCompanyLogin`), visible to whoever can open Company Info.
- Companies: Admin + Business Manager edit; PM, BM, Sales view and pick. Post-construction projects can be added from a company page. Property manager Company is a company picker with Other.
- Invoices: Admin + Business Manager approve. Approve is behind an Admin-only switch (off) until the first one is done with the bookkeeper. Auto-draft is per janitorial contract, off by default. Finished work is only drafted when someone picks it (Ready to bill), one invoice per building or job.
- Data fixes: The Smith $15,000/month and The George $9,800/month (Aug to Oct too), The George linked to its HubSpot deal.

**Waiting on people:** HubSpot admin to confirm API invoice creation on our plan. Nick: Russo, Bozzuto billing method, Nolan billing email. Fix JAG send-to (remove "email-"). Stop hand-making the first auto-draft contract's invoice before Oct 29.

---

## Ground rules for every phase

- **Database is shared with the live site** (Neon `ep-odd-silence`). Additive migrations only, applied with `prisma migrate deploy` (not `migrate dev`). Never reset, force, or use the real URL as a shadow DB. Data rewrites only with the user's OK.
- **Don't commit or push.** The user reviews and pushes. Give exact commands. No quotes or apostrophes in commit messages.
- **No em dashes** in code, UI copy, comments or commits.
- **ERP UI style:** short labels, helper text behind InfoTip "i" icons, searchable dropdowns (not plain `<select>`) for pickers.
- **Syncs apply once, then respect hand edits.** HubSpot never overwrites something a person changed in the ERP.
- **Property managers never see invoices or billing info** on their portal.
- **Tests never email real clients** and never create real invoices that reach QuickBooks. HubSpot invoices sync to QuickBooks once they are opened, so tests stay as drafts and get deleted.
- **Don't run live cron endpoints to test.** Replicate the query read-only.
- **Verify with typecheck, curl and DB reads**, not screenshot loops. Don't start a second `next dev` in this repo (it corrupts the user's `.next`).
- At the end of each phase, tell the user exactly what to click through (the checklist below is the starting point).

## Facts gathered (2026-10-14/15)

- **Roles today:** ADMIN 3, PROJECT_MANAGER 3 (David, Jennifer, Martha), SALES 1, FINANCE 1 (Maria, who has left), ESTIMATION 1, SUPERVISOR 1. The business manager currently uses a PM login.
- **No Company model.** Company names are free text in: `Building.builder` (2 of 20 filled), `Building.pmName/pmEmail/pmPhone`, `PropertyManager.company`, `ProjectContact.company`, `Project.lienGcName/lienOwnerName/lienGcAddress/lienOwnerAddress`, and `CoiHolder` (closest to a real company record, has aliases). Plus HubSpot companies and a billing Google Sheet.
- **20 buildings, 327 projects, 296 of them linked to a building.**
- **Invoices are made by hand in HubSpot's invoice editor.** 214 in 2026, about 50 a month lately, avg 1.6 line items, 205 tied to a deal. ERP only reads invoices (crons: `hubspot-invoice-sync` every 15 min, `hubspot-unit-invoices` hourly).
- **HubSpot token scopes today:** read only for invoices, line items, quotes, deals (deals also write), custom objects. **Missing:** `crm.objects.invoices.write`, `crm.objects.line_items.write`, `crm.objects.contacts.read`, `crm.objects.companies.read`. The token line in `.env.local` has an inline comment after it, so parse it carefully in scripts.
- **HubSpot invoices API:** create a draft (`POST /crm/v3/objects/invoices`, only `hs_currency` required), associate line items and a contact, then set `hs_invoice_status=open`. Drafts do not go to QuickBooks. Open ones do.
- **The ERP deletes lost deals on sync**, so win/loss history must come from HubSpot live (cache it, like the dashboards plan does).
- **Post-construction HubSpot data:** 1,371 deals. 6% of closed deals won (63 of 1,021). 47% of lost deals have no reason. Top reason "GC Not Awarded" (207). Lead source win rates: existing clients 33/126, referrals 4/25, BuildingConnected 2/364. Deal "Company" is a text field filled on 627 deals, same GC under several spellings (Ingerman 3 ways, ECI 2 ways). Won jobs median about $0.44/sq ft.
- **Billing delivery from the Google Sheet:** email (JAG with 2 people copied, J Centra has its own address; Nolan; Franjo), RealPage email inbox (UDR), Coupa (Air Communities), Procore (HIGH, Ingerman, Harkins), Cushman vendor portal with RealPage (The Block, The Sono), unknown (Russo, Bozzuto). The sheet holds plaintext passwords. Never copy them into code, plans or pages.
- **Known data gap:** turnover `approvedPriceCents` excludes the "Other" add-on.

---

## Phase 0: Prep (no code)

**Tasks for the user**
- [ ] Ask the HubSpot admin (likely Edwin Giraldo) to add these scopes to the ERP private app: `crm.objects.invoices.write`, `crm.objects.line_items.write`, `crm.objects.contacts.read`, `crm.objects.companies.read`. Ask them to confirm our HubSpot plan allows creating invoices through the API.
- [ ] Ask the HubSpot admin to make "Deal Lost Reason" and "How the customer reach Sueep" required when a deal moves to Deal Lost, and consider clearer lost reason options (see Phase 5).
- [ ] Move portal logins from the Google Sheet into the ERP Company Info logins. Change the password that is reused across Procore, Coupa and other accounts. Then remove passwords from the sheet.
- [x] Turn off Maria's ERP access (done).

**Click-through testing**
- [ ] Ask Claude to re-check the HubSpot token scopes (read-only call). All four new scopes should show.
- [ ] In HubSpot, try to mark a test deal lost without a reason. It should be blocked.
- [ ] In the ERP, open Company Info > Logins and confirm the portal logins are there and the passwords are hidden until revealed.

---

## Phase 1: Business Manager role, remove Finance

**Answered:** Maria (the only FINANCE user) has left and her account was already handled, so the FINANCE role is simply removed. Check read-only that no user still has FINANCE before removing it.

**Questions before starting**
1. Who is the business manager (David, Jennifer or Martha, all PROJECT_MANAGER today)?
2. What goes on the Business Manager dashboard on day one? Suggested: the PM dashboard plus the Money tab (needs action, checks, cash forecast). Billing lists from later phases get added as they are built.
3. Should PMs keep the cash forecast card? Today `dashboardCashForecast.ts` only allows ADMIN and FINANCE on one check, while `dashboardCards.ts` lists it for PMs too.

**Tasks**
- [ ] Add `BUSINESS_MANAGER` to `ERP_ROLES` (`src/lib/erpSession.ts`) and `VALID_ROLES` (`src/lib/erpSessionEdge.ts`).
- [ ] Add one helper (e.g. `isPmLevel(role)`: ADMIN, PROJECT_MANAGER, BUSINESS_MANAGER) and use it wherever PROJECT_MANAGER grants access, so the two roles can't drift apart. Files with PROJECT_MANAGER checks: `src/lib/erpAuth.ts`, `src/lib/erpSession.ts`, `src/lib/erpSessionEdge.ts`, `src/lib/erp/dashboardCards.ts`, `src/lib/erp/timeOff.ts`, `src/lib/erp/managementReminders.ts`, `src/lib/erp/lienAlerts.ts`, `src/lib/erp/janitorialQualityChecks.ts`, `src/app/erp/(shell)/ErpNav.tsx`, `src/app/erp/(shell)/schedule/page.tsx`, `src/app/erp/(shell)/projects/[id]/page.tsx`, `src/app/erp/(shell)/users/UsersTable.tsx`, `src/app/api/cron/schedule-nudge-morning/route.ts`, `src/app/api/cron/schedule-nudge-midday/route.ts`, `src/content/help/registry.ts`. Also grep API routes for inline role checks.
- [ ] Decide per place whether "PM" means access (Business Manager included) or "people who run crews" (schedule nudges, PM time off needing Admin approval). Ask the user if unclear.
- [ ] Remove FINANCE everywhere: role lists, `FINANCE_UP` arrays, the Finance dashboard branch in `src/app/erp/(shell)/page.tsx`, `dashboardCashForecast.ts` line 88, `api/erp/payroll/route.ts` comment, permission chart and labels in `UsersTable.tsx`, help registry roles.
- [ ] Business Manager dashboard: PM tabs plus whatever the user picked in question 2.
- [ ] Update help center docs and the role permission chart.
- [ ] Data: change the business manager's role to BUSINESS_MANAGER, only after the user OKs the exact statement.

**Click-through testing**
- [ ] Users page: "Business Manager" shows in the role picker and the permission chart. "Finance" is gone.
- [ ] Have the business manager log in. Every page they used before still opens: Projects, Buildings, Billing, Payroll, Employees, Janitorial, Property Managers, Calendar, Company Info, Insurance, Inbox.
- [ ] Their dashboard shows the agreed tabs and cards.
- [ ] A PM login still works exactly as before.
- [ ] Time off: a request from the business manager follows the rule the user chose.
- [ ] Help center shows the right articles for Business Manager.

---

## Phase 2: Companies and the billing directory

**Questions before starting**
1. Who can see portal logins: Admin only, or Business Manager too?
2. Track an "owned by" company for every building, or only on post-construction jobs (liens)?
3. Who keeps company info current (one named owner)?
4. Company types: Property manager, General contractor, Owner. Anything else (Developer, Architect)?
5. Billing cutoff format: a day of month ("pay app due by the 20th"), or free text?
6. Is Phase 0 done (companies scope added)? If not, skip the HubSpot import step for now.
7. How do Russo Management and Bozzuto want invoices? (ask Nick)

**Tasks**
- [ ] Schema (additive): `Company` (name, type, aliases, notes, hubspotCompanyId, archived), billing profile fields on Company (delivery method EMAIL / REALPAGE_EMAIL / PROCORE / COUPA / VENDOR_PORTAL / OTHER, portal URL, send-to, cc, billing cutoff, monthly or per job, payment terms, special instructions), `CompanyContact` (people: name, role, email, phone), encrypted portal login (reuse the Company Info encryption in `src/lib/erp/companyInfoServer.ts`), `Building.managedByCompanyId` and optional `ownedByCompanyId`, a building management history table (company, from, to), `Project.clientCompanyId`, billing override fields on Building and Project.
- [ ] Optional links on existing tables, old text fields kept: `PropertyManager.companyId`, `CoiHolder.companyId`.
- [ ] One helper that answers "where does this invoice go and why" (project override, then building override, then company), used by later phases.
- [ ] Pages: `/erp/companies` list (search, type filter) and a company page (billing profile, contacts, buildings, projects, logins for allowed roles). Company picker on Building and Project pages.
- [ ] Seed: user gives the billing sheet as CSV without passwords. Claude prepares the inserts and shows them before running. Logins are typed into the UI by the user.
- [ ] Link the 20 buildings (user picks in the UI, or Claude proposes a list for OK). Projects with a building get their client from it.
- [ ] HubSpot import (if scope is ready): companies on active deals, once. Match by name and aliases. After that, ERP edits win.
- [ ] Nav entry, help article, permission chart row.

**Click-through testing**
- [ ] Companies page lists the seeded companies. Search finds "JAG" and "Jefferson Apartment Group" as the same company.
- [ ] Open UDR: billing method, send-to, monthly yes, buildings Park Square, The Smith, The George.
- [ ] Open J Centra building: managed by JAG, with its own billing email override shown.
- [ ] Open a turnover project at J Centra: client shows JAG, and "invoices go to" shows the building override and says why.
- [ ] Change a building's management company: history keeps the old one with an end date.
- [ ] Portal login: visible to allowed roles only. Log in as a PM (or check with a PM) to confirm it is hidden if that was the decision.
- [ ] Property manager portal: no billing info anywhere.
- [ ] Old pages that used text company names (COI holders, property managers, lien fields) still look the same.

---

## Phase 3: Auto-drafted invoices and the Ready to send list (janitorial first)

**Questions before starting**
1. Who approves invoices: one person, or PM for their jobs and office for the rest?
2. Janitorial: one invoice per contract per month, with extras as extra lines? Line description wording?
3. When should the draft appear: on the billing day, or a set number of days before?
4. Payment terms and due date per company (from Phase 2) or a default?
5. Has the HubSpot admin confirmed API invoice creation works on our plan?
6. Opening an invoice in HubSpot sends it to QuickBooks and may email the client. Who OKs the first real one, and does the bookkeeper want to watch it?
7. Turnovers (second step): one invoice per unit, or one per building per week/month? Fix the "Other" add-on gap in `approvedPriceCents` first?

**Tasks**
- [ ] HubSpot client functions: create draft invoice, add line items, associate contact/company/deal, open invoice, delete draft. Store the HubSpot invoice id on the ERP side (link via existing `HubSpotContractInvoice` for janitorial).
- [ ] Draft builder for `RecurringContractPeriod` plus `RecurringContractCharge` extras. Idempotent: never two drafts for one period.
- [ ] Trigger: the existing daily recurring-contracts cron creates the draft when due (no new cron needed unless timing requires it).
- [ ] Ready to send page (Billing tab or its own page): list of drafts with amount, client, where it goes and why (Phase 2 helper), edit, approve, approve selected, discard.
- [ ] Approve: open the invoice in HubSpot, mark the period BILLED. The existing paid sync marks it PAID later.
- [ ] Count of drafts waiting on the Business Manager dashboard.
- [ ] Then repeat for turnovers once janitorial has run cleanly for a cycle.

**Click-through testing**
- [ ] For a test janitorial contract (or a real one with the user's OK), a draft shows on Ready to send with the right month, rate and extras.
- [ ] In HubSpot, the invoice exists as a draft on the right deal with the right line items. It is not in QuickBooks.
- [ ] Re-running the cron (via Claude replicating it read-only, or waiting a day) does not create a second draft.
- [ ] Edit a draft amount in the ERP, then check HubSpot shows the same.
- [ ] Discard a draft: gone in both places.
- [ ] Approve one real invoice together with the bookkeeper: status BILLED in the ERP, open in HubSpot, appears in QuickBooks.
- [ ] When the client pays, the period moves to PAID by itself.

---

## Phase 4: Invoice delivery

**Questions before starting**
1. Send from which address, and with what wording? (The ERP already sends project emails and has a daily email limit counter.)
2. Attach HubSpot's invoice PDF, include HubSpot's payment link, or both?
3. Coupa (Air Communities): which supplier option is turned on for us (email PO flip, portal, cXML)? Ask Air Communities if unknown.
4. Who works the "needs upload" list for Procore and portal clients?
5. Do we want to pilot an AI browser uploader later? (Not in this phase.)

**Tasks**
- [ ] On approve: email clients (and RealPage inbox) get the invoice emailed to send-to with cc, using the Phase 2 helper. Logged in the email log and inbox.
- [ ] Portal clients go to a "Needs upload" list with the portal link, the PDF, and the numbers to type. A "Marked uploaded" button records who and when.
- [ ] Procore jobs: show the GC's line items next to ours to make typing easy (from the SOV).
- [ ] Both lists on the Business Manager dashboard.

**Click-through testing**
- [ ] Set a test company's send-to to your own email. Approve a test invoice: you receive it, with the right cc (also your address), PDF and wording.
- [ ] Email log shows it, and the daily email counter goes up by one.
- [ ] A Procore client invoice lands on Needs upload instead of being emailed, with the Procore link and numbers.
- [ ] Mark it uploaded: it leaves the list and shows who did it.
- [ ] Put the test company's real addresses back.

---

## Phase 5: Win/loss reports and GC scorecards

**Questions before starting**
1. New lost reason list. Suggested: GC didn't win the job, Another sub won, Price, No response, Timing or on hold, Scope we don't do, Requirement we can't meet (union, prevailing wage, bonding, insurance, lifts), Other. Plus optional "who won" and "their price".
2. Which stages count as won (today assumed: Quote Approved, WIP, Billing, Work Completed)?
3. Days without activity before a quote is flagged as stale?
4. Dollar amount above which a loss gets a short review?
5. Who gets the monthly win/loss summary email?

**Tasks**
- [ ] Live HubSpot fetch of post-construction deals (including lost), cached about an hour. The ERP deletes lost deals on sync, so don't rely on the Project table.
- [ ] Map deal company text to Company records using aliases, so spellings merge.
- [ ] Win/loss page: win rate overall and by lead source, GC, job size, salesperson; loss reasons; trend by quarter. Info icons explain each number.
- [ ] GC scorecard on the company page: bids, wins, losses, "GC didn't win" count, price per sq ft quoted and won, days to pay (from billing).
- [ ] Stale quote list (Quote Sent with no activity for N days) on Sales and Business Manager dashboards.
- [ ] Monthly summary email (uses the email notification settings).

**Click-through testing**
- [ ] Win/loss page numbers roughly match the plan page (6% win rate, BuildingConnected 2 of 364).
- [ ] Open Ingerman: all three spellings counted together.
- [ ] Mark a test deal lost in HubSpot with a reason. Within the cache window it shows on the page.
- [ ] Stale quotes list shows deals sitting in Quote Sent. Click one and it opens the HubSpot deal.
- [ ] Monthly email: send a preview to yourself only.

---

## Phase 6: Post-construction tools

**Questions before starting**
1. Which inbox receives bid invites, and is it Gmail or Outlook? Who can grant read access?
2. OK to use the Claude API for reading bid emails (cost is small, needs an API key and a decision on where the key lives)?
3. Should accepted bid leads be created in HubSpot too, or only the ERP for now?
4. Estimating calendar: a category on the existing management calendar, or its own page?
5. Billing cutoffs: per company, or per project when a GC sets different dates per job?

**Tasks**
- [ ] Bid inbox reader: AI pulls GC, project name, address, bid due date, walkthrough date, plans link. Draft leads list for estimators to accept or ignore. Duplicate check.
- [ ] Estimating calendar: bid due dates and walkthroughs with reminders.
- [ ] Billing calendar: each GC's cutoff, a reminder to the PM to enter percent complete a few days before, a flag when a job misses the window.
- [ ] Price per sq ft check on quotes: compares against won jobs of similar size and type, and against that GC's history.
- [ ] Pipeline board view of post-construction deals, synced with HubSpot.

**Click-through testing**
- [ ] Forward a real bid invite to the bids inbox. A draft lead appears with the right dates. Accept it and it shows on the estimating calendar.
- [ ] Forward the same invite again: flagged as a duplicate.
- [ ] A job with a cutoff in the next few days shows on the billing calendar, and the PM gets the reminder (send to yourself for the test).
- [ ] A quote far above the usual price per sq ft shows a warning.
- [ ] Board view matches HubSpot's stages and counts.

---

## Later (decide after Phase 6)

The ERP owns deals from "won" onward, creates invoices itself, and connects to QuickBooks directly (see the QuickBooks plan notes). Optionally move leads and sales off HubSpot. Leadership decides how far to go once Phases 1 to 6 show what the team actually uses.
