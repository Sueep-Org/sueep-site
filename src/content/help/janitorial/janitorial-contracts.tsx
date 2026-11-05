import { Callout, H2, H3, P, UL, LI, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function JanitorialContracts() {
  return (
    <>
      <H2>What this covers</H2>
      <P>
        Setting up a janitorial contract, pricing it, keeping it current, and its billing months and profit. Each contract
        belongs to one building and bills a flat monthly price. Admins, Project Managers, the Business Manager and Sales can
        open <strong>Janitorial Contracts</strong> (left menu). New to it? Start with{" "}
        <A href="/erp/help/janitorial/getting-started">Janitorial: Getting Started</A>. Scheduling janitors and their hours
        are in <A href="/erp/help/janitorial/scheduling-and-hours">Janitorial Scheduling, Clock-In and Hours</A>.
      </P>
      <Img src="/help/janitorial/janitorial_contracts_1.png" alt="Janitorial contracts list" />

      <H2>The Contracts list</H2>
      <P>
        The <strong>Contracts</strong> tab lists every contract with its monthly rate, latest month, margin for the last full
        month (tagged <strong>Losing money</strong> when negative), expiration and next quality check. The strip at the top
        totals active contracts, monthly revenue and janitors scheduled.
      </P>

      <H2>Creating a contract</H2>
      <Steps>
        <Step n={1} title="Pick the building">
          Click <strong>+ New contract</strong>. Only buildings without a contract are listed. For a new client, choose{" "}
          <strong>New building</strong> and enter its name and address (property manager details are optional); the building
          is created with the contract.
        </Step>
        <Step n={2} title="Fill in the terms">
          Billing day of the month (1 to 28, the day each month is added), start date, service areas, and the salesperson who
          earns commission.
        </Step>
        <Step n={3} title="Set the price">
          Type the monthly rate, or tick <strong>Calculate the price from roles, hours, and rates</strong> (below).
        </Step>
      </Steps>
      <Callout type="info">
        Contracts are usually yearly, so the <strong>expiration date</strong> starts one year after the start date and can be
        changed. It shows on the Management calendar with reminders. When the client renews, click{" "}
        <strong>Renew for another year</strong> on the contract page. The expiration date never stops billing; only an{" "}
        <strong>end date</strong> does.
      </Callout>

      <H2>Pricing calculator</H2>
      <P>
        Used when creating a contract and on each contract&apos;s <strong>Pricing</strong> tab. It works like the proposal
        spreadsheets:
      </P>
      <UL>
        <LI>Add a line per role (Cleaner, Porter, Foreman...) with people, hours per week each, bill rate and pay rate.</LI>
        <LI>Monthly price = people × hours × bill rate × 52 ÷ 12. Payroll uses the pay rate.</LI>
        <LI>
          Employer payroll taxes are worked out per worker over a full year with the same rates as Payroll (Social Security
          and Medicare on all pay, unemployment only on each worker&apos;s first $7,000 and $10,000), then shown per month.
          Cleaning staff aren&apos;t on the health plan, so there is no health cost.
        </LI>
        <LI>Turn on <strong>overtime</strong> (extra half-time) or <strong>paid holidays</strong> to include those costs.</LI>
        <LI>Sales tax (starts at the percent set under Settings, Pricing) is taken from the monthly price. The summary shows payroll, tax, profit and margin.</LI>
        <LI>
          <strong>Override</strong> any line or the total to quote a round number; <strong>Use calculated</strong> goes back.
        </LI>
      </UL>
      <Callout type="info">
        The Pricing tab is the only place the monthly rate is set. Saving it changes the rate for months added from then on;
        months already on the contract keep their amount.
      </Callout>

      <H2>The contract page</H2>
      <UL>
        <LI>
          <strong>Details:</strong> the contract terms. Edit and click <strong>Save changes</strong>.
        </LI>
        <LI>
          <strong>Pricing:</strong> the calculator above.
        </LI>
        <LI>
          <strong>Schedule:</strong> who works there each week, the building&apos;s location, and{" "}
          <strong>Open in calendar</strong>.
        </LI>
        <LI>
          <strong>Billing:</strong> the months, below.
        </LI>
        <LI>
          <strong>Quality:</strong> site visits. See <A href="/erp/help/janitorial/quality-checks">Janitorial Quality Checks</A>.
        </LI>
      </UL>
      <P>
        <strong>Pause</strong>, <strong>Resume</strong> and <strong>End contract</strong> are at the top. Paused and ended
        contracts stop adding months, and paused contracts don&apos;t show on the calendar.
      </P>

      <H2>Billing months</H2>
      <UL>
        <LI>A month is added automatically once its billing day passes, at the contract&apos;s current monthly rate.</LI>
        <LI>Click a month&apos;s base amount to change it for that month only, for example a prorated first month.</LI>
        <LI>
          <strong>+ Add extra</strong> adds a one-off charge on top, like a post-event deep clean. Extras count in the
          month&apos;s total and are their own line on its invoice, but don&apos;t earn commission.
        </LI>
        <LI>
          <strong>Add a month manually</strong> covers months the automatic step missed, like a contract entered late.{" "}
          <strong>Remove</strong> deletes a month that shouldn&apos;t be billed, and only shows while it is Not Billed with no
          commission paid. To keep the month on record but not bill it (for example a month the client won&apos;t pay), set it
          to <strong>Voided</strong> on Project Billing → Recurring instead. It asks why, the reason shows when you hover the
          month, Auto-draft skips it, and it earns no commission.
        </LI>
      </UL>
      <H3>Invoicing a month</H3>
      <P>
        With <strong>Auto-draft</strong> on (Contracts tab of Ready to send), the ERP drafts each month&apos;s invoice 3 days
        before the billing day: the monthly amount first, then one line per extra. Approving it marks the month{" "}
        <strong>Billed</strong>, and it turns <strong>Paid</strong> when the payment is recorded in QuickBooks. You can also
        change the status by hand here or on Project Billing → Recurring. Commission only counts once a month is Paid. See{" "}
        <A href="/erp/help/billing/ready-to-send">Ready to Send: Drafting and Approving Invoices</A>.
      </P>

      <H2>Contract profit</H2>
      <P>
        The <strong>Billing</strong> tab shows, per month, the labor cost (the building&apos;s janitorial hours after unpaid
        breaks, at each janitor&apos;s current hourly rate) and the margin. The current month shows cost so far. Overtime
        premium isn&apos;t split across buildings, and a janitor with no hourly rate shows as &quot;No rate&quot;.
      </P>

      <Callout type="warning">
        Contracts no longer create projects or turnover units each month. Months from before that change may still have an old
        &quot;Monthly Contract&quot; project in the Projects list; billing for those months is tracked on the contract.
      </Callout>
    </>
  );
}
