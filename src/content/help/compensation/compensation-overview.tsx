import { Callout, H2, H3, P, UL, LI, Steps, Step, Img, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function CompensationOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The Compensation page (<strong>ERP → Compensation</strong>) is where Admins, PMs, and
        Finance manage everything related to pay: hourly/salary payroll, offshore fixed-rate
        payroll, sales commission, bid bonuses, and reimbursements. It has four top-level tabs:{" "}
        <strong>Payroll</strong>, <strong>Offshore Payroll</strong>, <strong>Commission</strong>{" "}
        (with Sales and Bids sub-tabs), and <strong>Reimbursements</strong>.
      </P>
      <Img src="/help/compensation/compensation_1.png" alt="Compensation page tabs" />

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Payroll tab">
          Shows every hourly and salaried employee's pay for a two-week (biweekly) pay period,
          computed automatically from logged labor. Nothing here is entered manually.
          <Img src="/help/compensation/compensation_2.png" alt="Payroll tab" />
          <UL>
            <LI>
              Use the <strong>◀ / ▶</strong> arrows to move one pay period at a time. The header
              shows the current date range.
            </LI>
            <LI>
              The <strong>All / Hourly / Salary / Contractors</strong> toggle filters which pay
              types show, and the search box filters by employee name.
            </LI>
            <LI>
              Each row shows regular hours, overtime hours (highlighted if any), total hours,
              rate, gross pay, and which projects the pay came from.
            </LI>
          </UL>
          <Callout type="info">
            The gear icon (top right) lets you change the <strong>pay period anchor</strong> date
            (this has to fall on a Monday), and download the currently filtered rows as a CSV.
          </Callout>
        </Step>

        <Step n={2} title="Offshore Payroll tab">
          A separate, simpler table for offshore employees who are paid a fixed monthly rate
          instead of hourly.
          <Img src="/help/compensation/compensation_3.png" alt="Offshore Payroll tab" />
          Use the <strong>◀ / ▶</strong> arrows to move month to month. Click the{" "}
          <strong>Paid / Not paid</strong> pill on a row to mark that employee paid for the
          month.
          <Callout type="tip">
            There&apos;s nothing to add here directly. Someone becomes offshore by being marked
            as offshore on their own employee profile, over on the Employees page.
          </Callout>
        </Step>

        <Step n={3} title="Commission → Sales">
          Shows every rep&apos;s commission on closed deals, change orders, and recurring
          janitorial contracts for a selected year, grouped into a tab per rep.
          <Img src="/help/compensation/compensation_4.png" alt="Commission Sales tab" />
          <UL>
            <LI>
              Pick the year from the pill links at the top. Totals for commission owed and
              commission already paid are shown for the whole company, and again per rep.
            </LI>
            <LI>
              Each rep panel has a progress bar toward the <strong>$1,500,000</strong> annual
              accelerator threshold. Once a rep&apos;s closed revenue for the year passes that,
              the accelerator rate kicks in for the rest of the year (see the table below).
            </LI>
            <LI>
              Rows are a mix of one-time deals, change orders (badged <strong>CO</strong>), and
              recurring janitorial billing periods (badged <strong>Recurring</strong>), all
              sorted together. Search, sort, and filter (paid status / project type) controls are
              in the top right of each rep panel.
            </LI>
            <LI>
              Toggle the <strong>Paid / Not paid</strong> pill on a row once that rep has actually
              been paid their commission for it.
            </LI>
          </UL>
          <Callout type="info">
            Commission rate and margin are calculated automatically. Nothing on this tab is
            manually edited except marking a row paid.
          </Callout>

          <H3>How commission is calculated</H3>
          <P>
            Commission is a percentage of the deal&apos;s <strong>contract value</strong>{" "}
            (not its margin dollars), based on the deal&apos;s margin percentage:
          </P>
          <Table>
            <THead>
              <tr>
                <TH>Margin</TH>
                <TH>Base rate</TH>
                <TH>Accelerator rate (after $1.5M)</TH>
              </tr>
            </THead>
            <tbody>
              <tr><TD>30% or higher</TD><TD>5%</TD><TD>10%</TD></tr>
              <tr><TD>20% – 29%</TD><TD>3%</TD><TD>7%</TD></tr>
              <tr><TD>10% – 19%</TD><TD>1%</TD><TD>3%</TD></tr>
              <tr><TD>Under 10%</TD><TD>0%</TD><TD>0%</TD></tr>
            </tbody>
          </Table>
          <P>
            If a deal straddles the $1.5M threshold, it&apos;s split automatically: the portion
            under the threshold earns the base rate, the portion over it earns the accelerator
            rate. Revenue under the 10% margin cutoff still counts toward a rep&apos;s $1.5M total
            even though it earns no commission itself.
          </P>
          <P>
            Recurring janitorial contracts are commissioned on their own schedule instead, as a
            percentage of the monthly billed rate:
          </P>
          <Table>
            <THead>
              <tr>
                <TH>Contract age</TH>
                <TH>Commission</TH>
              </tr>
            </THead>
            <tbody>
              <tr><TD>Months 1–12 (Year 1)</TD><TD>5% of monthly rate</TD></tr>
              <tr><TD>Months 13–24 (Year 2)</TD><TD>2% of monthly rate</TD></tr>
              <tr><TD>Month 25+</TD><TD>$0, no longer commissioned</TD></tr>
            </tbody>
          </Table>
        </Step>

        <Step n={4} title="Commission → Bids">
          Tracks the bid pipeline and the weekly bonus it earns, in two sections: <strong>Bid
          Commission</strong> (the bonus payouts) and <strong>Bids</strong> (the underlying log).
          <Img src="/help/compensation/compensation_5.png" alt="Commission Bids tab" />
          <UL>
            <LI>
              In the <strong>Bids</strong> section, click the <strong>+</strong> button to log a
              new bid: employee, date, project start date, company, deal, description, drawings
              status, and payout. New bids start as <strong>Not sent</strong>.
            </LI>
            <LI>
              Once a bid is actually submitted, toggle it to <strong>Sent</strong> on that row.
              This is what makes it count toward that week&apos;s bonus. Nothing is entered
              manually into the bonus table itself.
            </LI>
            <LI>
              The <strong>Bid Commission</strong> section aggregates each employee&apos;s verified
              (sent) bids per week and shows the bonus tier they hit. Toggle{" "}
              <strong>Paid / Not paid</strong> once a bonus has been paid out.
            </LI>
          </UL>
          <Callout type="warning">
            If the Bid Commission table looks empty, it&apos;s because no bids have been marked
            Sent yet for that week. Mark them Sent on the Bids table below it.
          </Callout>
          <P>Weekly bonus tiers, based on verified (sent) bids that week:</P>
          <Table>
            <THead>
              <tr>
                <TH>Verified bids / week</TH>
                <TH>Bonus</TH>
              </tr>
            </THead>
            <tbody>
              <tr><TD>40+</TD><TD>$1,000</TD></tr>
              <tr><TD>30–39</TD><TD>$600</TD></tr>
              <tr><TD>20–29</TD><TD>$300</TD></tr>
              <tr><TD>10–19</TD><TD>$100</TD></tr>
              <tr><TD>Under 10</TD><TD>$0</TD></tr>
            </tbody>
          </Table>
        </Step>

        <Step n={5} title="Reimbursements tab">
          A simple log of one-off reimbursements owed to employees.
          <Img src="/help/compensation/compensation_6.png" alt="Reimbursements tab" />
          <UL>
            <LI>
              Click the <strong>+</strong> button to add one: date, employee, amount,
              company/team, description, and an optional receipt upload (PDF, JPEG, PNG, or
              WEBP). Employee, company/team, description, and a positive amount are required.
            </LI>
            <LI>
              Filter by employee or by paid status (All / Unpaid / Paid) using the dropdowns at
              the top.
            </LI>
            <LI>
              Toggle <strong>Paid / Not paid</strong> on a row once it&apos;s been reimbursed, or
              click the <strong>×</strong> to delete a row entirely.
            </LI>
          </UL>
        </Step>
      </Steps>
    </>
  );
}
