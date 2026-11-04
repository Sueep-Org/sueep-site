import { Callout, H2, H3, P, UL, LI, Steps, Step, A } from "@/app/erp/components/help/HelpComponents";

export function JanitorialSchedulingAndHours() {
  return (
    <>
      <H2>What this covers</H2>
      <P>
        Putting janitors on the calendar, their clock-in links, watching the day on the <strong>Today</strong> tab, and
        checking hours on the <strong>Hours</strong> tab before payroll. Contract setup and billing are in{" "}
        <A href="/erp/help/janitorial/janitorial-contracts">Janitorial Contracts: Setup, Pricing and Billing</A>.
      </P>
      <Callout type="info">
        The calendar is the only source for janitorial pay. A janitor&apos;s profile (Pay type <strong>Janitorial</strong>)
        shows their schedule read-only, with a link to the calendar.
      </Callout>

      <H2>The janitorial calendar</H2>
      <P>
        <strong>Schedule → Janitorial Contracts</strong>, or <strong>Open in calendar</strong> from a contract&apos;s Schedule
        tab. It works like the Projects calendar: one chip per shift with the start time, janitor and building. Several
        janitors at one building on the same day are grouped into one chip with a count; click it to see each person. Use the
        arrows to change months and the filter icon to show one building or janitor.
      </P>
      <H3>Reading the chips</H3>
      <UL>
        <LI>Dashed: scheduled, no hours yet. Solid: hours logged (clocked in, or a manager entered the times).</LI>
        <LI>↻ marks a shift changed for that day, and 1× a one-time shift.</LI>
        <LI>Faded and crossed out: skipped.</LI>
        <LI>
          Red ⚠: that janitor has approved time off that day. The count at the top shows how many upcoming shifts need cover.
        </LI>
      </UL>

      <H2>Adding shifts</H2>
      <Steps>
        <Step n={1} title="Click + on a day">
          Pick the building and one or more janitors in the <strong>Janitors</strong> field; each gets their own shift. Their
          usual building is filled in from where they are scheduled most.
        </Step>
        <Step n={2} title="Set the hours">
          Start and end time. An end time earlier than the start is an overnight shift.
        </Step>
        <Step n={3} title="Repeat or one time">
          Keep <strong>Repeat every week</strong> on and pick the days for a regular shift, or turn it off for a one-time
          visit. Save.
        </Step>
      </Steps>
      <P>
        On an existing shift, <strong>Add another janitor</strong> copies its building, day, hours and repeat days.
      </P>

      <H2>Changing shifts</H2>
      <UL>
        <LI>
          Click a shift, <strong>Edit</strong>, then <strong>This day only</strong> (a cover, or different hours one day) or{" "}
          <strong>This and following weeks</strong> (a lasting change; earlier weeks keep the old schedule).
        </LI>
        <LI>
          <strong>Skip this day</strong> takes a regular shift off one date. <strong>Put back on schedule</strong> undoes it.
        </LI>
        <LI>
          <strong>Remove this and following</strong> ends a regular shift from that date on.
        </LI>
        <LI>
          Drag a shift to another day to move just that day. Shifts that already have hours can&apos;t be moved.
        </LI>
        <LI>
          <strong>Skip a day</strong> (top of the calendar, or click a date) skips every weekly shift that day, at all
          buildings or the ones you pick, for holidays and closures. One-time shifts stay. Nobody is paid for skipped shifts.{" "}
          <strong>Put back skipped shifts</strong> undoes it.
        </LI>
      </UL>
      <P>
        Everyone who can see the Schedule can view this calendar. Admins, Project Managers, the Business Manager and Sales can
        change it.
      </P>

      <H2>Clock-in links</H2>
      <P>
        Janitors clock in and out from a private link on their phone, with no ERP login. Create it when you first schedule
        someone (<strong>Create &amp; copy link</strong> in the shift box), or on their profile under{" "}
        <strong>Personal &amp; Documents → Clock-in link</strong> with <strong>Create clock-in link</strong>, then{" "}
        <strong>Copy link</strong> or <strong>Email link</strong>. Ask them to save it to their home screen.
      </P>
      <UL>
        <LI>
          Their page shows today&apos;s shifts with a big <strong>Clock in</strong>, then <strong>Clock out</strong> button.
        </LI>
        <LI>
          <strong>My schedule</strong> shows their next 7 days; <strong>My hours</strong> their hours this pay period, the same
          numbers payroll uses.
        </LI>
        <LI>
          An <strong>English / Español</strong> switch changes the language. It starts in the phone&apos;s language and
          remembers their choice.
        </LI>
        <LI>
          Working somewhere not on their schedule, they tap <strong>Working somewhere not listed?</strong> and pick the
          building. Those hours are flagged for review.
        </LI>
        <LI>Their location is saved when they clock in and out, if the phone allows it.</LI>
        <LI>
          Lost phone or shared link: <strong>Reset link</strong> makes a new one and the old one stops working.
        </LI>
      </UL>

      <H2>Today tab</H2>
      <P>
        <strong>Janitorial Contracts → Today</strong> is a live view of today&apos;s shifts, refreshed every minute, so
        problems get fixed while the shift is still on.
      </P>
      <UL>
        <LI>
          <strong>Needs attention</strong> lists: <strong>Late</strong> (15+ minutes past start, no clock-in),{" "}
          <strong>Needs cover</strong> (approved time off), <strong>Didn&apos;t clock out</strong> (still clocked in after the
          shift, including last night), <strong>No clock-in</strong> (the shift ended without one), and clock-ins far from the
          building.
        </LI>
        <LI>
          Each has <strong>Call</strong> and <strong>Text</strong> (when their profile has a phone number),{" "}
          <strong>Find a cover</strong> (opens that building on the calendar) or <strong>Correct hours</strong>.
        </LI>
        <LI>Below that: who is clocked in now, who is coming up, and who is done.</LI>
      </UL>

      <H2>Hours tab</H2>
      <P>
        <strong>Janitorial Contracts → Hours</strong> shows every shift for the week, grouped by janitor, with where its hours
        came from:
      </P>
      <UL>
        <LI>
          <strong>Clocked:</strong> their real clock-in to clock-out.
        </LI>
        <LI>
          <strong>From schedule:</strong> no clock-in, so the scheduled hours are paid.
        </LI>
        <LI>
          <strong>No clock-out:</strong> the scheduled end time is used and it is flagged.
        </LI>
        <LI>
          <strong>Time off</strong> (approved only) and <strong>Skipped</strong> count as 0 hours.
        </LI>
        <LI>
          <strong>Corrected:</strong> a manager set the times.
        </LI>
      </UL>
      <P>
        Shifts of 6 hours or more have a 30 minute unpaid break taken off (&quot;after 30 min break&quot;). Clocking in or
        leaving more than 15 minutes off schedule, an unscheduled shift, a missing clock-out or a clock-in far from the
        building shows under <strong>Needs review</strong>; tick <strong>Needs review only</strong> to see just those.
      </P>
      <P>
        Click <strong>Correct</strong> to set the real start and end, or mark it <strong>Didn&apos;t work</strong>.{" "}
        <strong>Undo correction</strong> puts it back. <strong>Download CSV</strong> exports the week.
      </P>
      <Callout type="info">
        Payroll reads these hours live, at each janitor&apos;s hourly rate, with overtime past 40 hours a week (janitorial and
        project hours together). Corrections show in Payroll right away. Under someone&apos;s hours on Payroll,{" "}
        <strong>See janitorial shifts</strong> opens exactly which shifts make up the number, and a janitor with nothing
        scheduled shows <strong>No janitorial schedule set</strong>.
      </Callout>

      <H2>Clock-in location check</H2>
      <P>
        A clock-in or clock-out more than about a quarter mile from the building is flagged on Today and under Needs review.
        Weak phone GPS gets some leeway.
      </P>
      <UL>
        <LI>Each building&apos;s location is looked up from its address after the first clock-in there.</LI>
        <LI>
          If a newer building can&apos;t be found, the <strong>Building location</strong> card on the contract page offers{" "}
          <strong>Look up address</strong>, <strong>Use last clock-in spot</strong> or <strong>Paste coordinates</strong> (in
          Google Maps, right-click the building and click the numbers to copy them). <strong>Check it on Google Maps</strong>{" "}
          confirms it.
        </LI>
        <LI>Changing a building&apos;s address clears its location so it is looked up again.</LI>
      </UL>
    </>
  );
}
