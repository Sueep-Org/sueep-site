import { Callout, H2, H3, P, UL, LI, A } from "@/app/erp/components/help/HelpComponents";

export function WinLossHelp() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        <strong>Win/Loss</strong> (left menu, Projects, then Clients) shows how post-construction bids turn out, read live from HubSpot
        and refreshed every hour. Admins, Project Managers, the Business Manager and Sales can open it. Pick{" "}
        <strong>Last 12 months</strong>, <strong>This year</strong> or <strong>All time</strong> at the top.
      </P>
      <UL>
        <LI>
          <strong>Won</strong> means Quote Approved or any later stage. <strong>Lost</strong> means Deal Lost. Everything else
          is open.
        </LI>
        <LI>Bids are counted by when they came in, so recent periods still have open bids.</LI>
        <LI>Win rate is won divided by won plus lost. Open bids don&apos;t count either way.</LI>
        <LI>
          Dollar amounts are the HubSpot deal Amount, except won jobs that are projects in the ERP: those use the ERP contract
          value, since that&apos;s what we bill from and HubSpot&apos;s Amount is often out of date on them.
        </LI>
      </UL>

      <H2>What&apos;s on the page</H2>
      <UL>
        <LI>
          Win rate, won and lost dollars, and the median price per square foot of won jobs. Jobs without Area SQFT in HubSpot
          are left out of the price per square foot only (the card says how many jobs it&apos;s based on); they still count
          everywhere else.
        </LI>
        <LI>Win rate by quarter: won and lost bids per quarter, with the win rate on top.</LI>
        <LI>
          <strong>Why we lose</strong>: HubSpot&apos;s Deal Lost Reason. &quot;No reason given&quot; means it was left blank in
          HubSpot.
        </LI>
        <LI>Win rate by job size and by GC: bar length is the number of bids, split into won, lost and open.</LI>
        <LI>Hover any bar for the details, or click Show table for the numbers.</LI>
        <LI>
          <strong>Stale quotes</strong>: bids in Quote Sent, Negotiation or Competitive Quote with no activity for 30 days.
          Click one to open it in HubSpot. The biggest also show on the dashboard&apos;s Sales tab.
        </LI>
      </UL>

      <H3>How GCs are matched</H3>
      <P>
        A bid&apos;s GC is the deal&apos;s Company field in HubSpot, or the company at the end of the deal name (&quot;Ardmore
        House II - Harkins Builders&quot;). It&apos;s matched to <A href="/erp/help/companies/companies-overview">Companies</A>{" "}
        by name or other names. If the same GC shows up under two spellings, open the company and add the other spelling to{" "}
        <strong>Other names</strong>. They merge on the next refresh.
      </P>

      <H2>GC scorecard</H2>
      <P>
        Each company page shows a <strong>Scorecard</strong> when it has bids or paid invoices: bids, win rate, how often the GC
        didn&apos;t win the job, price per square foot on won jobs, average days to pay, and its latest bids.
      </P>
      <Callout type="info">
        Lost bids are read from HubSpot because the ERP doesn&apos;t keep lost deals. Numbers update within an hour of a change
        in HubSpot.
      </Callout>
    </>
  );
}
