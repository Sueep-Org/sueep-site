import { Callout, H2, H3, P, UL, LI, A } from "@/app/erp/components/help/HelpComponents";

export function WinLossHelp() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        <strong>Win/Loss</strong> (left menu, Projects, then Clients) shows how post-construction bids turn out, read live from HubSpot
        (changes show within a couple of minutes). Admins, Project Managers, the Business Manager and Sales can open it. The filter button at
        the top right picks the period (<strong>Last 12 months</strong>, <strong>This year</strong>, <strong>All time</strong>)
        and a type of work (<strong>Cleaning</strong>, <strong>Painting</strong>, <strong>Cleaning + painting</strong>) to see
        only those bids. What&apos;s picked shows next to the title.
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
      <P>
        The four numbers at the top are always shown. Below them, four tabs: <strong>Overview</strong> (win rate by quarter,
        by type of work, by job size), <strong>Price</strong> (won vs lost price chart, $ per sq ft by type of work),{" "}
        <strong>Losses</strong> (why we lose by quarter and overall, re-bids, stale quotes) and <strong>Clients</strong> (by
        GC, property managers and owners, link companies). The filter applies to every tab, and the tab you&apos;re on stays
        open when you change it. Green means won and orange means lost on every chart, here and on the Deals board.
      </P>
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

      <H3>Why we lose, by quarter</H3>
      <P>
        One bar per quarter since 2023 (when lost reasons started being filled in), showing what share of that
        quarter&apos;s losses had each main reason: <strong>GC not awarded</strong> (orange), <strong>Price</strong>{" "}
        (violet, same as on the price chart), <strong>No answer</strong> (yellow), <strong>Did not move forward</strong>{" "}
        (pink), <strong>Other reasons</strong> (gray) and <strong>No reason</strong> (light gray). The number on top is how
        many deals were lost. A deal with several reasons counts once, under the first of those four. It follows the type
        of work filter but not the period. Hover a segment for its count, or use Show table.
      </P>

      <H3>Price: won vs lost</H3>
      <P>
        This chart answers &quot;are we losing on price?&quot;. Each dot is a won or lost bid in the period, placed by its
        price per square foot: HubSpot&apos;s quoted Amount divided by Area SQFT. There&apos;s one strip per type of work,
        with three rows: <strong>Won</strong> (green), <strong>Lost</strong> (orange) and <strong>Lost for Price</strong>{" "}
        (violet, the lost bids whose reason was Price). The dark line in each row is the median, and the sentence above
        says how far apart won and lost bids were.
      </P>
      <UL>
        <LI>
          It compares quotes with quotes, so won jobs use the quoted Amount here, not the ERP contract value (which can grow
          with change orders).
        </LI>
        <LI>
          Bids priced 3 times the middle or more, or a third or less, are left out as likely typos in Area SQFT or the
          amount. The note under each strip says how many.
        </LI>
        <LI>Hover a dot to see the deal and its numbers; click it to open the deal in HubSpot. Show table gives the numbers.</LI>
        <LI>With fewer than 3 won or lost bids in a type of work, the chart says there are too few to compare.</LI>
      </UL>

      <H3>GCs, property managers and owners</H3>
      <UL>
        <LI>
          <strong>By GC</strong> lists general contractors only. Under each GC with 3 or more priced bids, a gray line shows
          what we quote them per sq ft (for the type of work picked, cleaning when all work is picked), what we win at with
          them once they have 3 wins, and our usual winning price across all GCs. <strong>Not linked</strong> is every GC name on a deal that
          matches no company in the ERP, and <strong>No company</strong> is deals with none at all (often direct or existing
          client jobs, which win more often).
        </LI>
        <LI>
          <strong>By property manager and owner</strong> lists clients who hire us directly, using both pipelines: their
          bids and win rate in the period, the buildings we work in for them, active janitorial contracts and their monthly
          value, turnovers finished in the last 90 days, and average days to pay. The type of work filter doesn&apos;t apply to
          this list.
        </LI>
        <LI>
          A company&apos;s type (General contractor, Property manager, Owner) is set on its page under Companies.
        </LI>
        <LI>
          <strong>Link companies</strong> (Admins and the Business Manager) lists the unlinked names with the most bids.{" "}
          <strong>Link</strong> opens Companies searching for that name, to add the company or add the spelling to an existing
          one. Their deals then count under the right company everywhere.
        </LI>
      </UL>

      <H3>Type of work</H3>
      <P>
        Each bid&apos;s type of work comes from its line items in HubSpot (copied from the quote): painting words like
        &quot;Interior Painting&quot;, cleaning words like &quot;Final Cleaning&quot;, or both. Bids without line items use
        HubSpot&apos;s <strong>Type of business</strong> field. If neither says, the bid shows as <strong>Not known</strong>.
      </P>
      <Callout type="tip">
        Cleaning and painting price very differently per square foot, so use <strong>$ per sq ft by type of work</strong>,
        not the mixed number. A number based on fewer than 5 jobs is marked as too few to trust.
      </Callout>

      <H3>How GCs are matched</H3>
      <P>
        A bid&apos;s GC is the deal&apos;s Company field in HubSpot, or the company at the end of the deal name (&quot;Ardmore
        House II - Harkins Builders&quot;). It&apos;s matched to <A href="/erp/help/companies/companies-overview">Companies</A>{" "}
        by name or other names. If the same GC shows up under two spellings, open the company and add the other spelling to{" "}
        <strong>Other names</strong>. They merge on the next refresh.
      </P>

      <H2>Price check on quotes</H2>
      <P>
        Estimation&apos;s dashboard (Queue tab) has a <strong>Price check</strong> card. It looks at open quotes touched in the
        last 30 days that have an amount and Area SQFT, and compares their price per square foot with the usual range for
        their type of work.
      </P>
      <UL>
        <LI>
          <strong>Usual range</strong> is the middle half of the jobs we won: 1 in 4 won jobs were cheaper, 1 in 4 were higher.
          A type with fewer than 5 won jobs (painting, for now) uses all our bids of that type instead.
        </LI>
        <LI><strong>Outside usual range</strong>: above or below that, with how far off it is.</LI>
        <LI>
          <strong>Check the numbers</strong>: 3 times the usual price or more, or a third or less. That&apos;s usually a wrong
          Area SQFT or amount in HubSpot, worth fixing so the numbers stay useful.
        </LI>
      </UL>

      <H2>GC scorecard</H2>
      <P>
        Each company page shows a <strong>Scorecard</strong> when it has bids or paid invoices. At the top: their win rate next
        to our average, and one bar of won (green), lost (orange) and open (gray) bids. Below: total bids, how often the GC
        didn&apos;t win the job, and average days to pay (amber when slower than their payment terms). Price per square foot
        shows bars for what we quote them, what we win at with them and what we usually win at, with an above or below usual
        tag. Last, their latest bids with a Won, Lost or Open tag. The page opens right away and the scorecard fills in a moment
        later.
      </P>
      <Callout type="info">
        Lost bids are read from HubSpot because the ERP doesn&apos;t keep lost deals. Numbers update within a couple of minutes of a change
        in HubSpot.
      </Callout>
    </>
  );
}
