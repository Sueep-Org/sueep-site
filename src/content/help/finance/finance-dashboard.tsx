import { Callout, H2, P, UL, LI } from "@/app/erp/components/help/HelpComponents";

export function FinanceDashboard() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The Finance tab on the dashboard (<strong>ERP → Dashboard → Finance</strong>) shows revenue, costs, and profit from
        what&apos;s entered in the ERP: projects, labor logs, materials, janitorial hours, and payroll settings. Admins,
        Project Managers, and Finance can see it.
      </P>
      <Callout type="info">
        It&apos;s a management view to spot trends, not an accounting report. Expenses that aren&apos;t in the ERP, like rent,
        insurance, software, vehicles, or taxes, aren&apos;t included, so the bookkeeping P&amp;L is still the official number.
        Data starts August 2026, when the ERP came into full use. Hover any rounded number to see the exact amount.
      </Callout>

      <H2>Picking dates</H2>
      <UL>
        <LI><strong>Since Aug 2026</strong> (or a year, once there&apos;s more than one) shows everything month by month.</LI>
        <LI>
          <strong>Custom dates</strong> shows any range, like August 1 to 7. Everything counts by its exact day. A janitorial
          contract month counts only for the days of it inside the dates (August 1 to 7 is 7/31 of August&apos;s amount),
          with the janitors&apos; hours from just those days. Salaries and offshore pay count day by day the same way.
          Days after today aren&apos;t counted. Dates before August 2026 work but are missing jobs and costs.
        </LI>
        <LI>
          <strong>Count by Completed</strong> puts work in the month it was finished. <strong>Count by Paid</strong> counts
          only work marked paid, in the month it was marked paid. A job marked paid before paid dates were saved
          (janitorial months before October 2026) uses its completion month instead. Its job costs move with it, so
          margins stay the same.
        </LI>
      </UL>

      <H2>Revenue</H2>
      <UL>
        <LI>The contract value of finished work, counted when it was finished (not when it was invoiced or paid).</LI>
        <LI>A project&apos;s original contract counts when the whole project is Complete: turnovers on the day they were marked complete, other projects on their end date.</LI>
        <LI>
          Each change order counts on its own, on the day it was completed, even while its project is still open. So a
          change order finished in August counts in August, with its own costs. One that isn&apos;t done yet counts with its
          project once the project is Complete. It counts at its price (or its estimate if no price is set). Voided and
          rejected change orders are left out. In <strong>Count by Paid</strong>, a change order counts on the day it was
          marked paid (ones paid before October 2026 have no paid date, so they use their completion day).
        </LI>
        <LI>Janitorial contracts count once per billing month: that month&apos;s contract amount plus any extra charges added to it. The month in progress counts by days so far (on the 10th of a 31 day month, 10/31 of the amount), to match its labor, which only counts up to today.</LI>
        <LI>Completed projects with no contract value or no end date can&apos;t be counted. The <strong>!</strong> icon at the top lists each one by name; click a name to open it and fill in what&apos;s missing.</LI>
        <LI>A year compares against the same months of the year before. Since data starts August 2026, that first appears in August 2027.</LI>
      </UL>

      <H2>Costs</H2>
      <P>Costs are job costs plus overhead. The breakdown under <strong>Where the money went</strong> adds up to the same total.</P>
      <UL>
        <LI><strong>Job costs</strong> are the same numbers as the Projects table, so a job&apos;s margin here always matches what you see there.</LI>
        <LI>
          <strong>Hourly payroll</strong> is priced exactly the way Payroll pays it: each log at the rate on it. If a worker
          passes 40 hours in a week (counting all their projects and janitorial shifts), each hour past 40 also costs half
          of that week&apos;s average hourly rate. It also includes labor typed on a project that has no labor logs.
        </LI>
        <LI>
          <strong>Janitorial hours</strong> use an admin&apos;s correction if there is one, otherwise clock-in time,
          otherwise the scheduled shift, with a 30 minute unpaid break taken off shifts of 6+ hours.
        </LI>
        <LI>
          <strong>Salaries</strong>: each salaried employee&apos;s yearly salary divided by 12, every month from their hire
          date while they&apos;re Active. Their time on jobs costs yearly pay divided by 2,080 inside job costs, and that
          part isn&apos;t counted twice.
        </LI>
        <LI><strong>Offshore</strong>: each offshore employee&apos;s monthly rate from their hire date, plus any month marked paid in Offshore Payroll.</LI>
        <LI>Pay comes from each person&apos;s pay history, so a raise or a switch between hourly and salary only counts from the day it started. Someone marked Inactive counts up to the day their status changed.</LI>
        <LI><strong>Commission</strong>: commission payouts and weekly bid bonuses, when they were marked paid. <strong>Reimbursements</strong>: on the date of the expense.</LI>
        <LI><strong>Contractors</strong>: the cost on each contractor assignment. <strong>Materials and travel</strong>: every material log plus travel typed on the project.</LI>
        <LI>Not included: BD caller bid bonuses and any expense not tracked in the ERP.</LI>
      </UL>

      <H2>Net profit</H2>
      <UL>
        <LI>Revenue minus costs. Margin is net profit divided by revenue. Hover Costs to see gross profit (revenue minus job costs only).</LI>
        <LI>In <strong>Count by Paid</strong> it&apos;s labeled <strong>Net profit (paid work only)</strong>: revenue only counts paid work, but salaries and other overhead count in full, so it runs low until customers pay. Use Completed to judge how profitable the work is.</LI>
        <LI>Overhead is steady every month but revenue isn&apos;t, so a single month can go negative even when the year is fine.</LI>
      </UL>

      <H2>Billed vs paid</H2>
      <UL>
        <LI>Work finished in the selected dates, split by its billing status today: <strong>Paid</strong>, <strong>Billed, waiting</strong> (invoiced, not paid yet), and <strong>Done, not billed</strong>. This always uses the completion date, even when counting by Paid.</LI>
        <LI><strong>Future</strong> is the contract value of projects that are Active, Upcoming, or On Hold right now: sold, not finished yet. It includes change orders on those projects that aren&apos;t done yet. It doesn&apos;t change with the dates picked.</LI>
        <LI><strong>Needs review</strong> (in amber under Future) is the part of Future that looks finished or stale: the end date has passed, an Upcoming project&apos;s start date has passed, or an Active project has had no work logged in 60+ days. Those projects are listed under Needs review at the bottom of the Future revenue tab. Updating their status fixes both numbers.</LI>
      </UL>

      <H2>Revenue by category</H2>
      <UL>
        <LI>Post-construction is commercial cleaning and painting. Turnovers are janitorial turnover units. Janitorial contracts are counted by contract month.</LI>
        <LI>
          Each bar is split into the <strong>original contract</strong> (blue) and <strong>change orders</strong> (orange),
          with the two amounts written underneath. Change orders count on their own completion day (see Revenue above).
        </LI>
        <LI>Hover a category for its job count, job costs, and margin. Post-construction, Turnovers, and Janitorial contracts always show, even at $0. Under Janitorial contracts, the number of Active contracts and their monthly rates added together (hover for the yearly amount), plus the start date while none has started yet.</LI>
      </UL>

      <H2>Commission</H2>
      <UL>
        <LI>Uses the same rules as the Commission tab on the Payroll page, so the two always match.</LI>
        <LI><strong>Earned</strong>: commission that became due in the selected dates. A deal is due once it and all its change orders are paid, a janitorial contract month once that month is paid, and a bid bonus for its week.</LI>
        <LI><strong>Paid</strong>: commission and bid bonuses marked paid in the selected dates. This is the Commission line in Where the money went.</LI>
        <LI><strong>Owed now</strong>: everything earned but not marked paid yet, from any date. It doesn&apos;t change with the dates picked.</LI>
        <LI>A deal or janitorial contract with no salesperson earns no commission (for example, one the owner sold himself).</LI>
      </UL>

      <H2>Jobs</H2>
      <UL>
        <LI><strong>Most profitable</strong> is ranked by profit in dollars, <strong>Lowest margin</strong> by margin percentage. Both only include work in the selected dates. They show the top 5; click <strong>See all</strong> for every job.</LI>
        <LI><strong>Future revenue</strong> lists every project that&apos;s In progress, Upcoming, or On hold, biggest first, including change orders that aren&apos;t done yet. Its total matches Future in Billed vs paid.</LI>
        <LI>A project can show up more than once in the job lists when its contract and change orders were counted in different months.</LI>
      </UL>
    </>
  );
}
