# Role Dashboards Plan

Make the ERP home dashboard useful for each role: Estimation, Sales, Finance and
Project Managers. Plus customizable cards and "since you last visited" for everyone.

## Decisions (made 2026-10-14)

- **PM "my jobs"** shows **all active jobs**, not a per-PM filter. Projects have no PM owner field, and we are not adding one.
- **Win rate and turnaround** come **live from HubSpot**, cached for an hour. The ERP deletes lost deals on sync, so it can't answer this alone.
- **Customizable cards** are **per person**: hide and reorder for yourself, with a Reset button that restores the role default.
- **PMs also get Finance cards 1 to 4** (needs action, cash forecast, jobs losing money, reconciliation).
- **Admin** gets no new Admin-only cards. Admin already sees everything, so the new Finance and PM cards appear for Admin too and can be hidden with Customize.
- **Employee** dashboard stays as it is.

## Layout: everything lives in tabs

So the dashboard never turns into one long scroll:

- **New cards always go on a tab.** Nothing new is added to the existing Overview, Operations or Team tabs.
- **At most 3 cards per tab.**
- **A card with several lists uses inner tabs** (the existing `JobTabs` style) instead of stacking lists. Example: Needs action has inner tabs Overdue / Ready to bill / Payroll / Liens.
- **Each tab only loads its own data** (the current `?tab=` server render). Slow sources like HubSpot only load when someone opens that tab.
- **Tab labels get a small red count** when something on that tab needs action, so people know where to look without opening every tab.
- **Lists show 5 to 8 rows**, then "See all".

### Tabs by role

| Role | Tabs (new ones in bold) | Cards on each new tab |
|---|---|---|
| Estimation | **Queue** · **Accuracy** · **Wins** | Queue: Waiting on me. Accuracy: Estimate accuracy, Pricing check. Wins: Win rate and turnaround |
| Sales | Overview · Operations · **Sales** | Sales: Contract renewals, My commission |
| Finance | **Money** · Finance | Money: Needs action, Cash forecast, Checks (losing money + reconciliation). The old Overview link cards become one small row of links at the top |
| Project Manager, Admin | Overview · Operations · **Jobs** · **Money** · Finance · Team | Jobs: Job status board, Waiting on others, Crew conflicts. Money: same three cards as Finance |

Card merges to stay within 3 per tab:
- **Budget burn** becomes an inner tab of the Job status board (All / Problems / Over budget) instead of its own card.
- **Jobs losing money** and **Reconciliation** become one **Checks** card with two inner tabs.

## What each role gets

| Role | New cards |
|---|---|
| Estimation | Waiting on me, Estimate accuracy, Pricing check, Win rate and turnaround (replaces the two current lists) |
| Sales | Contract renewals, My commission |
| Finance | Needs action, Cash forecast, Checks |
| Project Manager, Admin | Needs action, Cash forecast, Checks, Job status board (with budget burn), Waiting on others, Crew conflicts |
| Everyone with cards | Customize, "New since last visit" badges |

## How it's built

One **card registry** (`src/lib/erp/dashboardCards.ts`). Each card has an id, a title, the tab it belongs to, the roles that see it, a short InfoTip, and a server loader that returns rows (or inner tabs of rows). Dashboards render the role's default card list, then apply the person's saved layout. Every card built later plugs into this, so Customize and "since last visit" work on all of them without extra wiring.

**One migration, in Phase 1 only:** a new `DashboardPreference` table (user email, hidden cards, card order, last seen, previous seen). Applied with `migrate deploy` after you OK it. No other schema changes in this plan.

## General testing rules (every phase)

- `npx tsc --noEmit` and lint pass.
- Numbers are checked with **read-only** scripts that rerun the card query and compare it to the page the card summarizes (for example, the overdue total vs the Billing page). Scripts pass `DATABASE_URL` explicitly and refuse to write.
- No live cron runs, no real emails, no screenshot loops.
- Dev server testing happens in a scratchpad copy, so it never shares your `.next` folder.
- At the end of each phase I'll give you exact steps to try it on your local dev server.

---

## Phase 1. Foundation (card registry + preferences table)

**Build**
- `DashboardCard` component: title, InfoTip "i", count badge, optional inner tabs, rows that each click through to a filtered page, empty state, "See all" after 5 to 8 rows. It matches the look of the current `JobTabs` card.
- Card registry plus `cardsForTab(role, tab)`. A tab with no cards for a role isn't shown.
- New tab ids in `DashboardTabs` (queue, accuracy, wins, sales, jobs, money), each tab's role list, and support for a red count on a tab label. Estimation gets a tab row for the first time.
- A check (run in the typecheck step) that fails if any tab has more than 3 cards for any role.
- `DashboardPreference` model and migration. Includes `lastSeenAt` and `previousSeenAt` now, so Phase 10 needs no second migration.
- API: `GET/PUT /api/erp/dashboard-prefs`, scoped to the logged-in user only.

**Visible change:** none yet. New tabs stay hidden until they have a card.

**Test**
- Adding a 4th card to one tab in a test makes the 3-card check fail.
- Migration applied. The table exists and is empty.
- With curl: save prefs, read them back, then confirm another user can't read or write them.
- Unknown card ids in a saved layout are ignored, not a crash.

## Phase 2. Estimation cards (no HubSpot needed)

Tabs: **Queue** (Waiting on me, opens by default) and **Accuracy** (Estimate accuracy, Pricing check). Wins is added in Phase 8.

**Build**
- **Estimate accuracy:** completed jobs from the last 6 months. Estimated (labor + material) vs actual cost, using the same actuals helper as project margins (`projectMargin.ts`). Grouped by segment (Post-construction, Turnovers, Janitorial, Other) showing the average % over or under. Below that, the 5 jobs that missed the most, each linking to its project. Jobs missing either an estimate or actuals are skipped and counted ("12 jobs skipped, no actuals").
- **Waiting on me:** the current "missing estimates" list, sorted **oldest first**, with "waiting 9 days". A red "starts in 3 days" chip shows when the start date is 7 or fewer days away.
- **Pricing check:** average contract value per job by segment. For turnovers, the average price by bedrooms/bathrooms. Price per sq ft is added once David's sq ft turnover upgrade lands.

**Test**
- Read-only script: pick 3 completed jobs by hand and confirm the accuracy % matches the estimate and margin numbers on each project page.
- Waiting list count matches the old "missing estimates" count. Order is oldest first.
- A project starting in 5 days shows the red chip, one starting in 10 days doesn't.

## Phase 3. Sales cards

Tab: new **Sales** tab after Overview and Operations. Overview is not changed.

**Build**
- **Contract renewals:** active janitorial contracts whose expiration (or end) date is within 90 days, soonest first. Shows building, monthly rate and days left, and links to the contract. Overdue (already past) shows in red at the top.
- **My commission:** this month, this quarter and this year, split into paid and owed. Reuses `loadCommissionRows` plus `CommissionPayout`. The logged-in user is matched to their Employee record by email. If there's no match, the card says "Your login isn't linked to an employee record" instead of showing $0.

**Test**
- Renewals list matches the Janitorial page filtered to contracts expiring within 90 days.
- For one sales rep, the commission card totals match the Commission tab on Payroll for the same date range.
- A Sales login with no Employee record shows the "not linked" message.

## Phase 4. Money tab: Needs action + Checks

Tab: new **Money** tab. For Finance it's the first tab and replaces Overview. For PM and Admin it sits after Jobs, before Finance.

**Build**
- **Needs action** (one card, four inner tabs):
  - **Overdue invoices**, grouped by age: 1-30, 31-60, 61-90, 90+ days past due. Pulled from unit, SOV and contract HubSpot invoices with a balance due and no paid date. **Counted once per invoice, not once per line**, because one invoice can cover many lines.
  - **Ready to bill:** completed projects, change orders and SOV lines that are still Not billed. Reuses the ready-to-bill logic.
  - **Payroll lock:** whether the current and previous pay periods are closed, with a red flag if the previous period ended and isn't closed yet.
  - **Lien deadlines** in the next 30 days, from `loadLienWatch`.
- **Checks** (one card, two inner tabs):
  - **Losing money:** active jobs where cost so far is more than the expected cost at this % done, or more than the contract value. Shows the overrun amount and links to the job.
  - **Reconciliation:** HubSpot invoice lines stuck in Pending review (with a link to the review queue), and ERP lines marked Billed more than 7 days ago with no HubSpot invoice linked.
- Finance role: the old Overview link cards become one compact row of links at the top of Money.
- The Money tab label shows a red count of overdue invoices + payroll not locked + liens due within 7 days.

**Test**
- Overdue total matches the sum of unpaid, past-due invoices on the Billing page. A multi-line invoice is counted once (checked with a read-only script).
- Ready-to-bill count matches the Billing page's Not billed + completed filter.
- Payroll lock state matches the Payroll page for the same periods.
- Lien list matches the lien deadlines shown on post-con billing.
- Log in as Finance, PM and Supervisor: Finance and PM see the cards, Supervisor doesn't.

## Phase 5. Money tab: Cash forecast

Tab: third card on **Money**, between Needs action and Checks.

**Build**
- Weekly bars for the next 8 weeks: **money in** vs **money out**, plus a running balance line. Labeled as an estimate.
  - **In:** open invoice balances by due date (anything already overdue goes in week 1, marked "overdue, may slip"), ready-to-bill amounts, and janitorial monthly billing on each contract's billing day. Unbilled work assumes 30-day payment terms; this is a setting you can change.
  - **Out:** payroll (gross from the last closed period, repeated every two weeks), insurance premiums (same spread the Finance dashboard uses), scheduled sub costs, and commission owed.
- Hovering a bar shows what makes it up. Each part links to its source page.

**Test**
- Read-only script recomputes week 1 by hand from the source tables and matches the card.
- Payroll bars equal the last closed period's gross. Insurance matches the Finance dashboard's insurance line for the same days.
- Changing the payment-terms setting moves unbilled amounts to the right weeks.

## Phase 6. Jobs tab: Job status board (with budget burn)

**Build**
- New **Jobs** tab for PM and Admin, after Operations.
- **Job status board:** every active job, one row each, with 4 lights:
  - **Schedule:** green on track, amber when % done trails the time used, red when past the end date and not complete.
  - **Budget:** hours or cost used vs estimate.
  - **Logs:** scheduled days already passed with no labor logged.
  - **COI:** expired or expiring within 30 days.
  - Inner tabs: **Problems** (default), **All**, **Over budget**. Segment filter chips (Post-con, Turnovers, Janitorial).
- **Over budget** inner tab (budget burn): jobs at 80%+ of estimated hours or cost, sorted by % used. Reuses the red/orange/amber thresholds from the Supervisor dashboard so the two always agree.

**Test**
- A job past its end date and still active shows a red schedule light.
- Budget % for 3 jobs matches the supervisor badges on the same jobs.
- Missing-logs light agrees with the existing "Needs labor logged" widget.
- COI light agrees with the COI alerts widget.

## Phase 7. Jobs tab: Waiting on others + Crew conflicts

Tab: second and third cards on **Jobs**. The Jobs tab label shows a red count of red-light jobs + crew conflicts.

**Build**
- **Waiting on others** (inner tabs: Property managers / Change orders / Subs):
  - Property manager requests and changes not answered yet (same source as today's widget).
  - Change orders in Draft or Pending for more than 3 days.
  - Subs scheduled in the next 14 days whose insurance is missing or expired.
- **Crew conflicts** (next 14 days):
  - An employee or sub on two different jobs on the same day (project and change-order day assignments).
  - Anyone scheduled on a day they have approved time off.
  - Each row links to the schedule for that day.

**Test**
- Create a test double-booking and a time-off overlap in a **scratchpad database copy**, never the shared DB. Both show up and disappear once fixed.
- Waiting counts match the property manager requests page and the change order lists.

## Phase 8. Estimation: Win rate and turnaround (HubSpot)

Tab: new **Wins** tab for Estimation. HubSpot is only called when someone opens this tab.

**Build**
- Server-side HubSpot deal search across the configured pipelines for the last 90 days and the last 12 months: won, lost and open counts, win rate by count and by dollars, and median days from deal created to proposal sent.
- Cached for 1 hour. If HubSpot is down, the card shows "HubSpot unavailable" while the rest of the dashboard still loads.
- **Needs from you:** the post-construction pipeline's **proposal stage id** added to `HUBSPOT_PIPELINE_STAGE_MAP` (only janitorial has one today). Turnaround for post-con is hidden until that's added.

**Test**
- For one month, compare won/lost counts with a HubSpot deals report filtered the same way.
- Simulate a HubSpot error (bad token in the scratchpad copy). The card degrades and the page doesn't break.
- Read-only: no ERP rows change (this card only reads HubSpot).

## Phase 9. Customize cards

**Build**
- "Customize" button on the dashboard. A panel lists your cards **grouped by tab**, each with a show/hide toggle and up/down arrows to reorder within its tab. Cards can't be moved to another tab, so the 3-per-tab limit holds. Hiding every card on a tab hides the tab. You can also choose which tab the dashboard opens on. Reset restores the role default. Changes save instantly through the Phase 1 API.
- Applies to every registry card from Phases 2 to 8.
- Optional 9b: move the existing Admin/PM Overview widgets (Where we are, Needs attention, Margins, etc.) into the registry so they can be customized too. This is a bigger refactor of `page.tsx`, so it's split out to be approved separately.

**Test**
- Hide a card, reload: still hidden. Reorder: order kept. Reset: role default is back.
- Two users on the same role keep separate layouts.
- A card added in a later release shows up for people with saved layouts (appended at the end, not lost).

## Phase 10. "Since you last visited"

**Build**
- On dashboard load, "since" = your previous visit. "Last seen" only rolls forward if the last visit was over 30 minutes ago, so refreshing doesn't wipe the badges.
- Each card shows "3 new". New rows get a small dot. The tab label shows a small dot when something on it is new, so people know which tab to open. A "Mark all seen" button sets "since" to now.
- "New" means created or changed after "since": new overdue invoices, new waiting items, new conflicts, new renewals entering the 90-day window, and so on.

**Test**
- Set your `previousSeenAt` back a day in the scratchpad copy. Items from today show as new.
- Refresh twice within a few minutes: badges stay. "Mark all seen" clears them.
- Two users each have their own "since".

---

## Order and size

| Phase | What | Size | Migration |
|---|---|---|---|
| 1 | Foundation | S | Yes (DashboardPreference) |
| 2 | Estimation Queue + Accuracy tabs | M | No |
| 3 | Sales tab | S | No |
| 4 | Money tab: Needs action, Checks | L | No |
| 5 | Money tab: Cash forecast | M | No |
| 6 | Jobs tab: status board with budget burn | M | No |
| 7 | Jobs tab: waiting on others, crew conflicts | M | No |
| 8 | Estimation Wins tab (HubSpot) | M | No |
| 9 | Customize (+ optional 9b) | S (+L) | No |
| 10 | Since you last visited | M | No |

Phases 2 to 8 don't depend on each other once Phase 1 is in, so they can be reordered if one role is more urgent.
