import { Callout, H2, H3, P, Steps, Step, A, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function JanitorialGettingStarted() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        <strong>Janitorial Contracts</strong> covers buildings we clean every week for a flat monthly price. This guide is the
        whole cycle in the order you use it, one short step each. Every step links to the article with the details.
      </P>
      <Callout type="info">
        The calendar is the source of truth for janitor pay. Hours come from the janitor&apos;s clock-in; if they don&apos;t
        clock in, the scheduled hours are paid. Nothing else, like a number on their profile, sets their hours.
      </Callout>

      <H2>The cycle</H2>
      <Steps>
        <Step n={1} title="Set up the contract (once per building)">
          <strong>Janitorial Contracts → + New contract</strong>: building, monthly price (typed or calculated from roles and
          rates), billing day, start date, service areas and salesperson. See{" "}
          <A href="/erp/help/janitorial/janitorial-contracts">Janitorial Contracts: Setup, Pricing and Billing</A>.
        </Step>
        <Step n={2} title="Put janitors on the schedule">
          <strong>Schedule → Janitorial Contracts</strong>, click + on a day, pick the building, janitors and hours, and keep{" "}
          <strong>Repeat every week</strong> on. See{" "}
          <A href="/erp/help/janitorial/scheduling-and-hours">Janitorial Scheduling, Clock-In and Hours</A>.
        </Step>
        <Step n={3} title="Send each janitor their clock-in link">
          The first time you schedule someone, the shift box offers <strong>Create &amp; copy link</strong>. Text it to them.
          No ERP login needed; the page works in English or Spanish.
        </Step>
        <Step n={4} title="Every day: the Today tab">
          <strong>Janitorial Contracts → Today</strong> lists anyone late, needing a cover, not clocked out or clocking in far
          from the building, with Call, Text, Find a cover and Correct hours.
        </Step>
        <Step n={5} title="Every week: the Hours tab">
          <strong>Janitorial Contracts → Hours</strong> shows where each shift&apos;s hours came from. Tick{" "}
          <strong>Needs review only</strong> and correct anything wrong.
        </Step>
        <Step n={6} title="Each pay period: payroll">
          <strong>Compensation → Payroll</strong> pays the janitorial hours automatically at each janitor&apos;s hourly rate,
          with weekly overtime (Settings, Payroll). See{" "}
          <A href="/erp/help/compensation/compensation-overview">Compensation Overview</A>.
        </Step>
        <Step n={7} title="Each month: bill the client">
          The month is added on the billing day. With <strong>Auto-draft</strong> on, its invoice is drafted on Ready to send
          3 days before; approving it marks the month Billed, and it turns Paid when the payment is recorded in QuickBooks.
          See <A href="/erp/help/billing/how-invoicing-works">Start Here: How Billing Works</A>.
        </Step>
        <Step n={8} title="Visit the building">
          Schedule quality checks from the contract&apos;s <strong>Quality</strong> tab and send the property manager a
          summary. See <A href="/erp/help/janitorial/quality-checks">Janitorial Quality Checks</A>.
        </Step>
        <Step n={9} title="Check each building's profit">
          The contract&apos;s <strong>Billing</strong> tab shows labor cost and margin per month; the Contracts list flags
          buildings that lost money last month.
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
          <tr>
            <TD>The client renews for another year</TD>
            <TD>Renew for another year on the contract page moves the expiration date forward.</TD>
          </tr>
        </tbody>
      </Table>

      <H3>Who can use it</H3>
      <P>
        Admins, Project Managers, the Business Manager and Sales can see Janitorial Contracts and make changes. Everyone else
        who can see the Schedule can view the janitorial calendar but can&apos;t change it.
      </P>
    </>
  );
}
