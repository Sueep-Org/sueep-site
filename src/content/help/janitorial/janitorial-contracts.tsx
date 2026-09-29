import { Callout, H2, P, UL, LI, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function JanitorialContracts() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The Janitorial Contracts page (<strong>ERP → Janitorial Contracts</strong>) is where recurring janitorial
        contracts live: buildings we clean on a flat monthly rate instead of per-job turnover
        pricing. Each contract belongs to one building. Admins, Project Managers, Sales, and Finance
        can see this page. New to it? Start with{" "}
        <A href="/erp/help/janitorial/getting-started">Janitorial Contracts: Getting Started</A>.
      </P>
      <Img src="/help/janitorial/janitorial_contracts_1.png" alt="Janitorial contracts list" />

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Creating a contract">
          Click <strong>+ New contract</strong>, pick the building, and fill in the monthly rate,
          billing day of month (1 to 28), start date, service areas, and the salesperson who earns
          commission on it.
          <Callout type="info">
            Only buildings without a contract show up in the picker. For a new client, choose{" "}
            <strong>New building</strong> and enter its name and address (property manager details
            are optional). The building is created together with the contract.
          </Callout>
        </Step>

        <Step n={2} title="Pricing a contract">
          When creating a contract you can just type a monthly rate, or tick{" "}
          <strong>Calculate the price from roles, hours, and rates</strong>. The calculator (also on each
          contract&apos;s <strong>Pricing</strong> tab) works like the proposal spreadsheets:
          <UL>
            <LI>Add a line per role (Cleaner, Porter, Foreman...) with people, hours per week each, bill rate, and pay rate.</LI>
            <LI>Monthly price = people × hours × bill rate × 52 ÷ 12. Payroll uses the pay rate plus the payroll add-on (19% for W2 + health by default).</LI>
            <LI>Turn on <strong>overtime</strong> (extra half-time) or <strong>paid holidays</strong> to include those costs.</LI>
            <LI>Sales tax (6% by default) is taken from the monthly price. The summary shows payroll, tax, profit, and margin as you type.</LI>
            <LI><strong>Override</strong> any line or the total to quote a round number; <strong>Use calculated</strong> goes back.</LI>
            <LI>
              The Pricing tab is the only place the monthly rate is set. Saving it changes the rate for months added from then
              on; months already billed keep their amount.
            </LI>
          </UL>
        </Step>

        <Step n={2} title="Editing, pausing, or ending a contract">
          Open a contract from the list. The <strong>Details</strong> tab holds its terms (edit and{" "}
          <strong>Save changes</strong>); <strong>Schedule</strong> shows who works there and the
          building&apos;s location; <strong>Billing</strong> has the months. Use <strong>Pause</strong>,{" "}
          <strong>Resume</strong>, or <strong>End contract</strong> at the top. Paused and ended contracts stop
          generating new months. Changing the monthly rate only affects months generated after the
          change, not ones already on the contract.
        </Step>

        <Step n={3} title="Billing months">
          <UL>
            <LI>
              A new month is added automatically once that month&apos;s billing day passes, at the
              contract&apos;s current monthly rate.
            </LI>
            <LI>
              Click a month&apos;s base amount to change it for that month only, e.g. a prorated
              first month.
            </LI>
            <LI>
              Use <strong>+ Add extra</strong> for one-off charges on top of the flat rate (e.g. a
              post-event deep clean). Extras are included in that month&apos;s total but don&apos;t
              earn commission.
            </LI>
            <LI>
              Flip the billing status to Billed and then Paid from here or from the{" "}
              <A href="/erp/help/billing/billing-overview">Billing → Recurring</A> tab. Commission
              only counts once a month is Paid.
            </LI>
            <LI>
              <strong>Add a month manually</strong> covers months the automatic step missed, like
              backfilling a contract entered late. <strong>Remove</strong> deletes a month that
              shouldn&apos;t be billed at all, and only shows while it&apos;s still Not Billed with no
              commission paid.
            </LI>
          </UL>
        </Step>

        <Step n={4} title="Scheduling janitors on the calendar">
          Janitors are scheduled on <strong>ERP → Schedule → Janitorial Contracts</strong>. A
          contract&apos;s page lists who works there each week, and <strong>Open in calendar</strong>{" "}
          jumps straight to that building.
          <UL>
            <LI>
              The calendar looks and works like the Projects calendar: one chip per shift showing
              the start time, janitor, and building. When several janitors work the same building
              that day, they&apos;re grouped into one chip with the building name and a count; click
              it to see each person&apos;s shift. A red ⚠ on the group means someone in it has time off.
              Hover a chip for details. Use the arrows to change months and the filter icon to show one
              building or janitor.
            </LI>
            <LI>
              Click the <strong>+</strong> on a day, pick the building and janitor, and set the
              start and end time. Keep <strong>Repeat every week</strong> on and choose the days for
              a regular shift, or turn it off for a one-time visit. An end time earlier than the
              start is an overnight shift.
            </LI>
            <LI>
              To put several janitors on the same building and hours, keep adding them in the{" "}
              <strong>Janitors</strong> field before saving; each gets their own shift. On an existing
              shift, <strong>Add another janitor</strong> copies its building, day, hours, and repeat days.
            </LI>
            <LI>
              The calendar is the only source for janitorial pay. A janitor&apos;s profile (Pay type{" "}
              <strong>Janitorial</strong>) shows their schedule read-only with a link here. When you add
              a shift, their building is filled in from where they&apos;re scheduled most.
            </LI>
          </UL>
        </Step>

        <Step n={5} title="Changing or removing a shift">
          Click a shift, then <strong>Edit</strong>, and choose <strong>This day only</strong> (a
          cover, or different hours for one day) or <strong>This and following weeks</strong> (a
          lasting change; earlier weeks keep the old schedule).
          <UL>
            <LI><strong>Skip this day</strong> takes a regular shift off one date, for a holiday or site closure. <strong>Put back on schedule</strong> undoes it.</LI>
            <LI><strong>Remove this and following</strong> ends a regular shift from that date on.</LI>
            <LI>
              <strong>Drag a shift</strong> to another day to move just that day (the weekly schedule
              stays the same). Shifts that already have hours recorded can&apos;t be moved.
            </LI>
            <LI>
              <strong>Skip a day</strong> (top of the calendar, or click a day&apos;s date) skips every
              weekly shift that day, at all buildings or just the ones you pick, for holidays and
              closures. One-time shifts stay. <strong>Put back skipped shifts</strong> undoes it.
            </LI>
            <LI>
              Like the Projects calendar, a dashed chip is scheduled with no hours logged yet, and a solid chip has hours logged (the janitor clocked in, or a manager entered the worked times). ↻ marks a shift changed for that day and 1× a one-time shift. A faded, crossed-out
              chip was skipped. A red <strong>⚠</strong> means that janitor has time off logged that
              day; the count at the top shows how many upcoming shifts need cover.
            </LI>
            <LI>
              Everyone who can see Schedule can view this calendar; Admins, Project Managers, Sales,
              and Finance can make changes. Paused contracts don&apos;t show.
            </LI>
          </UL>
        </Step>

        <Step n={6} title="Janitor clock-in links">
          Janitors clock in and out from a private link on their phone, no ERP login needed. On the
          janitor&apos;s employee profile, open <strong>Personal &amp; Documents → Clock-in link</strong>{" "}
          and click <strong>Create clock-in link</strong>, then <strong>Copy link</strong> and text it
          to them (or <strong>Email link</strong>). Ask them to save it to their home screen.
          <UL>
            <LI>
              Quicker: when you pick a janitor on a calendar shift who has no link yet, the shift
              dialog shows <strong>Create &amp; copy link</strong>.
            </LI>
            <LI>The page shows their shifts for today with a big <strong>Clock in</strong> button, then <strong>Clock out</strong>.</LI>
            <LI>
              <strong>My schedule</strong> shows their next 7 days, and <strong>My hours</strong> shows their
              hours so far this pay period (the same numbers payroll uses).
            </LI>
            <LI>An <strong>English / Español</strong> switch at the top changes the language. It starts in the phone&apos;s language and remembers their choice.</LI>
            <LI>If they&apos;re working somewhere not on their schedule, they tap <strong>Working somewhere not listed?</strong> and pick the building. Those hours are flagged for review.</LI>
            <LI>Their location is saved when they clock in and out, if their phone allows it.</LI>
            <LI>Lost phone or shared link? <strong>Reset link</strong> makes a new one and the old one stops working.</LI>
          </UL>
        </Step>

        <Step n={7} title="Reviewing hours">
          <strong>Janitorial Contracts → Hours</strong> shows every shift for the week, grouped by janitor, with
          where its hours came from:
          <UL>
            <LI><strong>Clocked:</strong> their actual clock-in to clock-out.</LI>
            <LI><strong>From schedule:</strong> they didn&apos;t clock in, so their scheduled hours are used.</LI>
            <LI><strong>No clock-out:</strong> they clocked in but not out, so the scheduled end time is used and it&apos;s flagged.</LI>
            <LI><strong>Time off</strong> and <strong>Skipped</strong> count as 0 hours.</LI>
            <LI>Shifts of 6 hours or more have a 30 minute unpaid break taken off (shown as &quot;after 30 min break&quot;).</LI>
            <LI>Clocking in or leaving more than 15 minutes off schedule, working an unscheduled shift, or a missing clock-out shows under <strong>Needs review</strong>.</LI>
          </UL>
          Click <strong>Correct</strong> on any shift to set the real start and end time, or mark it{" "}
          <strong>Didn&apos;t work</strong>. <strong>Undo correction</strong> puts it back.{" "}
          <strong>Download CSV</strong> exports the week.
          <Callout type="info">
            Payroll uses these hours live, at each janitor&apos;s hourly rate, with overtime past 40
            hours a week (janitorial and project hours combined). Corrections show up in Payroll
            right away.
          </Callout>
        </Step>

        <Step n={8} title="Watching today: Janitorial Contracts → Today">
          A live view of today&apos;s shifts that refreshes every minute, so problems can be fixed while
          the shift is still happening.
          <UL>
            <LI><strong>Needs attention</strong> lists anyone 15+ minutes late without clocking in, anyone with time off who needs a cover, anyone still clocked in after their shift ended (including last night), shifts that ended with no clock-in, and clock-ins far from the building.</LI>
            <LI>Each has <strong>Call</strong> and <strong>Text</strong> buttons (when their profile has a phone number), <strong>Find a cover</strong> (opens that building on the calendar), or <strong>Correct hours</strong>.</LI>
            <LI>Below that: who&apos;s clocked in now, who&apos;s coming up later, and who&apos;s done.</LI>
          </UL>
        </Step>

        <Step n={9} title="Clock-in location check">
          A clock-in or clock-out more than about a quarter mile from the building is flagged on Today
          and under <strong>Needs review</strong> on the Hours tab. Weak phone GPS gets some leeway.
          <UL>
            <LI>Each building&apos;s location is looked up from its address automatically after the first clock-in there.</LI>
            <LI>
              Newer buildings sometimes can&apos;t be found. On the contract page, the{" "}
              <strong>Building location</strong> card lets you <strong>Look up address</strong> again,{" "}
              <strong>Use last clock-in spot</strong>, or <strong>Paste coordinates</strong> (in Google
              Maps, right-click the building and click the numbers to copy them). Use{" "}
              <strong>Check it on Google Maps</strong> to confirm it&apos;s right.
            </LI>
            <LI>Changing a building&apos;s address clears its location so it&apos;s looked up again.</LI>
          </UL>
        </Step>

        <Step n={10} title="Contract profit">
          Each contract&apos;s <strong>Billing</strong> tab shows, per month, the labor cost (that
          building&apos;s janitorial hours after unpaid breaks, at each janitor&apos;s current hourly rate)
          and the margin. The current month shows cost so far. The contracts list shows each
          building&apos;s margin for last month and flags any that lost money. Overtime premium isn&apos;t
          split across buildings, and a janitor with no hourly rate set shows as &quot;No rate&quot;.
        </Step>
      </Steps>

      <Callout type="warning">
        Recurring contracts no longer create projects or turnover units each month. Months generated
        before this change may still have an old &quot;Monthly Contract&quot; project in the Projects
        list; billing for those months is now tracked on the contract instead.
      </Callout>
    </>
  );
}
