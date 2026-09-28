import { Callout, H2, P, UL, LI, Steps, Step, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

export function JanitorialContracts() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The Janitorial page (<strong>ERP → Janitorial</strong>) is where recurring janitorial
        contracts live: buildings we clean on a flat monthly rate instead of per-job turnover
        pricing. Each contract belongs to one building. Admins, Project Managers, Sales, and Finance
        can see this page.
      </P>
      <ImgPlaceholder label="Janitorial contracts list" />

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

        <Step n={2} title="Editing, pausing, or ending a contract">
          Open a contract from the list and use <strong>Edit</strong>, <strong>Pause</strong>,{" "}
          <strong>Resume</strong>, or <strong>End contract</strong>. Paused and ended contracts stop
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
              the start time, janitor, and building. Hover a chip for details. Use the arrows to
              change months and the filter icon to show one building or janitor.
            </LI>
            <LI>
              Click the <strong>+</strong> on a day, pick the building and janitor, and set the
              start and end time. Keep <strong>Repeat every week</strong> on and choose the days for
              a regular shift, or turn it off for a one-time visit. An end time earlier than the
              start is an overnight shift.
            </LI>
            <LI>Several janitors can work the same building on the same day.</LI>
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
              A dashed chip was changed for that day or is a one-time shift. A faded, crossed-out
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
            <LI>The page shows their shifts for today with a big <strong>Clock in</strong> button, then <strong>Clock out</strong>.</LI>
            <LI>If they&apos;re working somewhere not on their schedule, they tap <strong>Working somewhere not listed?</strong> and pick the building. Those hours are flagged for review.</LI>
            <LI>Their location is saved when they clock in and out, if their phone allows it.</LI>
            <LI>Lost phone or shared link? <strong>Reset link</strong> makes a new one and the old one stops working.</LI>
          </UL>
        </Step>

        <Step n={7} title="Reviewing hours">
          <strong>Janitorial → Hours</strong> shows every shift for the week, grouped by janitor, with
          where its hours came from:
          <UL>
            <LI><strong>Clocked:</strong> their actual clock-in to clock-out.</LI>
            <LI><strong>From schedule:</strong> they didn&apos;t clock in, so their scheduled hours are used.</LI>
            <LI><strong>No clock-out:</strong> they clocked in but not out, so the scheduled end time is used and it&apos;s flagged.</LI>
            <LI><strong>Time off</strong> and <strong>Skipped</strong> count as 0 hours.</LI>
            <LI>Clocking in or leaving more than 15 minutes off schedule, working an unscheduled shift, or a missing clock-out shows under <strong>Needs review</strong>.</LI>
          </UL>
          Click <strong>Correct</strong> on any shift to set the real start and end time, or mark it{" "}
          <strong>Didn&apos;t work</strong>. <strong>Undo correction</strong> puts it back.{" "}
          <strong>Download CSV</strong> exports the week.
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
