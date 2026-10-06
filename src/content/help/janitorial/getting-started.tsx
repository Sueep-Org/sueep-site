import { Callout, H2, H3, P, UL, LI, Steps, Step, A, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function JanitorialGettingStarted() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Janitorial Contracts covers buildings we clean every week for a flat monthly price. This guide walks through the
        whole cycle in the order you&apos;ll use it: set up the contract, schedule janitors, get them clocking in, watch the
        day, review hours, run payroll, and bill the month. For every button and screen in detail, see{" "}
        <A href="/erp/help/janitorial/janitorial-contracts">Janitorial Contracts</A>.
      </P>
      <Callout type="info">
        The calendar is the source of truth for janitor pay. Hours come from the janitor&apos;s clock-in; if they don&apos;t
        clock in, the scheduled hours are paid. Nothing else (like a number on their profile) sets their hours.
      </Callout>

      <H2>The workflow</H2>
      <Steps>
        <Step n={1} title="Set up the contract (once per building)">
          Go to <strong>Janitorial Contracts</strong> in the left nav and click <strong>+ New contract</strong>.
          <UL>
            <LI>Pick the building, or choose <strong>New building</strong> to add it here.</LI>
            <LI>Set the start date, the billing day (the day each month is added), service areas, and the salesperson.</LI>
            <LI>
              Enter the monthly price, or tick <strong>Calculate the price from roles, hours, and rates</strong> to build it
              from staffing: people, hours a week, bill rate, and pay rate per role. The calculator shows payroll, tax, profit,
              and margin as you type. Override any line or the total to quote a round number.
            </LI>
          </UL>
          You can build or change the pricing later on the contract&apos;s <strong>Pricing</strong> tab. That&apos;s the
          only place the monthly price is set.
        </Step>

        <Step n={2} title="Put janitors on the schedule">
          Open <strong>Schedule → Janitorial Contracts</strong> (or <strong>Open in calendar</strong> from the
          contract&apos;s Schedule tab). Click the <strong>+</strong> on a day.
          <UL>
            <LI>Pick the building and add one or more janitors.</LI>
            <LI>Set the start and end time. Keep <strong>Repeat every week</strong> on and choose the days.</LI>
            <LI>Save. The shifts appear every week from that day on.</LI>
          </UL>
          Chips are <strong>dashed</strong> until hours are logged and turn <strong>solid</strong> once the janitor clocks
          in. Several janitors at one building on the same day collapse into one chip; click it to see each person.
        </Step>

        <Step n={3} title="Send each janitor their clock-in link">
          The first time you schedule someone without a link, the shift dialog shows <strong>Create &amp; copy link</strong>.
          Text the link to the janitor and ask them to save it to their phone&apos;s home screen. You can also manage links on
          their profile under <strong>Personal &amp; Documents → Clock-in link</strong> (copy, email, reset, or turn off).
          <P>
            Janitors don&apos;t need an ERP login. Their page works in English or Spanish and shows today&apos;s shifts with
            Clock in and Clock out buttons, their next 7 days, and their hours for the pay period.
          </P>
        </Step>

        <Step n={4} title="Every day: check the Today tab">
          <strong>Janitorial Contracts → Today</strong> refreshes every minute and puts problems at the top under{" "}
          <strong>Needs attention</strong>:
          <UL>
            <LI><strong>Late:</strong> 15+ minutes past start with no clock-in. Call or text them from the row.</LI>
            <LI><strong>Needs cover:</strong> the janitor has approved time off. Find a cover opens the calendar for that building.</LI>
            <LI><strong>Didn&apos;t clock out</strong> and <strong>No clock-in</strong>: fix the hours with Correct hours.</LI>
            <LI>Clock-ins far from the building are flagged too.</LI>
          </UL>
          To change one day (a cover, different hours, a closure), click the shift on the calendar and choose{" "}
          <strong>This day only</strong>, or <strong>Skip this day</strong>. For a holiday, use <strong>Skip a day</strong>{" "}
          at the top of the calendar.
        </Step>

        <Step n={5} title="Every week: review hours">
          <strong>Janitorial Contracts → Hours</strong> shows every shift and where its hours came from: Clocked, From
          schedule (no clock-in), Time off (approved only), Skipped, or Corrected. Tick <strong>Needs review only</strong> to see just the
          flagged ones (late, left early, no clock-out, unscheduled, far from the building) and use{" "}
          <strong>Correct</strong> to fix any of them. Shifts of 6+ hours have a 30 minute unpaid break taken off.
        </Step>

        <Step n={6} title="Each pay period: run payroll">
          <strong>Compensation → Payroll</strong> pays janitorial hours automatically at each janitor&apos;s hourly rate,
          combined with any project hours, with overtime past 40 hours a week. <strong>See janitorial shifts</strong> under
          someone&apos;s hours opens exactly which shifts make up the number. A janitor with nothing scheduled shows a red{" "}
          <strong>No janitorial schedule set</strong> warning.
        </Step>

        <Step n={7} title="Each month: bill the client">
          On the billing day, the month is added to the contract&apos;s <strong>Billing</strong> tab at the monthly price.
          Add one-off extras (like a deep clean) to that month, then mark it <strong>Billed</strong> and{" "}
          <strong>Paid</strong>, either there or on <strong>Project Billing → Recurring</strong>. Commission for the
          salesperson counts once the month is Paid.
        </Step>

        <Step n={8} title="Check how each building is doing">
          The contract&apos;s Billing tab shows labor cost and margin for each month (janitorial hours × hourly rate). The
          Contracts list shows every building&apos;s margin for last month and tags any that lost money.
        </Step>
      </Steps>

      <H2>Quick answers</H2>
      <Table>
        <THead>
          <tr>
            <TH>Situation</TH>
            <TH>What happens / what to do</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>A janitor forgets to clock in</TD>
            <TD>Their scheduled hours are paid. Correct the shift on the Hours tab if they didn&apos;t work.</TD>
          </tr>
          <tr>
            <TD>A janitor forgets to clock out</TD>
            <TD>Hours run to the scheduled end time and the shift is flagged for review.</TD>
          </tr>
          <tr>
            <TD>Someone covers a shift</TD>
            <TD>Click the shift → Edit → This day only → pick the cover. The covering person is paid for that day.</TD>
          </tr>
          <tr>
            <TD>Building closed for a holiday</TD>
            <TD>Skip a day at the top of the calendar. Nobody is paid for skipped shifts. Put back skipped shifts undoes it.</TD>
          </tr>
          <tr>
            <TD>A janitor&apos;s regular schedule changes</TD>
            <TD>Click their shift on the first changed date → Edit → This and following weeks. Earlier weeks stay as they were.</TD>
          </tr>
          <tr>
            <TD>Called in for extra work</TD>
            <TD>Add a one-time shift (untick Repeat every week), or the janitor taps Working somewhere not listed.</TD>
          </tr>
          <tr>
            <TD>Lost phone or shared link</TD>
            <TD>Reset link on their profile. The old link stops working; send them the new one.</TD>
          </tr>
          <tr>
            <TD>Raise the monthly price</TD>
            <TD>Change it on the contract&apos;s Pricing tab. It applies to months added from then on.</TD>
          </tr>
        </tbody>
      </Table>

      <H3>Who can use it</H3>
      <P>
        Admins, Project Managers, Sales, and Finance can see Janitorial Contracts and make changes. Everyone else who can see
        the Schedule can view the janitorial calendar but can&apos;t change it.
      </P>
    </>
  );
}
