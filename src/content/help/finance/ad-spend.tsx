import { Callout, H2, P, UL, LI, A } from "@/app/erp/components/help/HelpComponents";

export function AdSpend() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The <strong>Ad spend</strong> page shows what Sueep spends on Facebook and Instagram ads, straight from Meta, and what
        each lead costs. Open it from the <strong>Ad spend</strong> link on the Finance dashboard (next to Overhead details)
        or the <strong>Ad spend ↗</strong> button on the Recruitment page, which opens it in a new tab. Admins, PMs,
        Business Managers and Sales can see it. Numbers refresh every hour.
      </P>

      <H2>Picking dates</H2>
      <UL>
        <LI>
          <strong>This month</strong> and <strong>Last month</strong> are one click.
        </LI>
        <LI>
          For any other dates, pick a <strong>From</strong> and <strong>To</strong> day and click <strong>Show</strong>. Dates in
          the future are cut to today. Meta keeps about 3 years of history.
        </LI>
      </UL>

      <H2>What the page shows</H2>
      <UL>
        <LI>
          <strong>Spent, Leads, Cost per lead, Clicks</strong>, each with a ▲ or ▼ against the same length of time just before
          (for This month, the same days of last month). Green is good news (more leads, cheaper leads), red is bad news.
        </LI>
        <LI>
          <strong>What the money was for</strong>: spend split into Hiring, Franchise and Other, with leads and cost per lead for
          each, plus how many franchise inquiries and field job applications reached the ERP in the same dates.
        </LI>
        <LI>
          <strong>Spend by month</strong>: the last 12 months, stacked by Hiring, Franchise and Other. Cost per lead is under
          each month. Hover a month for the details, or click <strong>Show table</strong>.
        </LI>
        <LI>
          <strong>Campaigns</strong>: every campaign that spent money, with leads, cost per lead and clicks.
        </LI>
      </UL>
      <Callout>
        Campaigns are put in Hiring, Franchise or Other by their <strong>name</strong>. Keep the word &quot;Hiring&quot; or
        &quot;Franchise&quot; in new campaign names in Meta so they land in the right group.
      </Callout>

      <H2>Leads: Meta vs the ERP</H2>
      <P>
        Leads are what Meta counts: forms filled on Facebook plus website forms the Meta Pixel saw. The ERP counts under each
        group include everyone who came in those dates from any source (website, Indeed, walk-ins), because the website
        forms don&apos;t record yet whether someone came from an ad. Use them as a rough check.
      </P>

      <H2>No double counting with QuickBooks</H2>
      <UL>
        <LI>
          Meta charges the company card, and the bookkeeper files the charge in QuickBooks (usually Advertising &amp;
          Marketing). The <A href="/erp/help/finance/finance-dashboard">Finance dashboard</A> already counts that, so Meta&apos;s
          numbers are never added to any cost total.
        </LI>
        <LI>
          The Finance dashboard&apos;s <strong>Where the money went</strong> card shows a note with the Meta spend for the
          dates you&apos;re looking at, for reference.
        </LI>
        <LI>
          <strong>QuickBooks → details</strong> has a <strong>Meta ads</strong> line each month: Meta&apos;s spend next to the
          QuickBooks charges from Meta or Facebook. A big gap means a charge is missing, entered twice, or filed under the
          wrong account. Meta charges when spend reaches a billing limit, so a charge can land in the next month.
        </LI>
      </UL>

      <H2>If it says Meta isn&apos;t connected</H2>
      <P>
        The page uses a Meta token that belongs to the business (system user <strong>erp-bot</strong>), not a person. If it
        stops working, see <strong>META_ADS_SETUP.md</strong> in the code, or ask the tech team: it lists who has access in
        Meta and how to make a new token.
      </P>
    </>
  );
}
