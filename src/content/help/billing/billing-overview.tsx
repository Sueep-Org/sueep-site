import { Callout, H2, H3, P, UL, LI, Steps, Step, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

export function BillingOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The Project Billing page (<strong>ERP → Project Billing</strong>) is where completed work
        gets marked as billed and paid. It has four tabs: <strong>Post-Construction</strong>,{" "}
        <strong>Janitorial</strong>, <strong>Recurring</strong>, and <strong>Needs Review</strong>.
        The first three list completed work in a date range and let you flip its billing status;
        the fourth is a queue of HubSpot invoice line items the system couldn&apos;t confidently
        match on its own.
      </P>
      <ImgPlaceholder label="Project Billing page with tabs and date range" />

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="The date range and search">
          The top of the page has a <strong>From / To</strong> date range (defaulting to the start
          of the current month through today) and a search box.
          <Callout type="info">
            Typing a search bypasses the date range entirely and searches across all dates by
            project, building, or unit name instead. The date fields gray out while a search is
            active, clear the search to go back to filtering by date.
          </Callout>
        </Step>

        <Step n={2} title="Post-Construction tab">
          Lists completed Schedule of Values items and change orders for post-construction
          projects in range, grouped under their project.
          <ImgPlaceholder label="Post-Construction billing tab" />
          Click the <strong>Billing Status</strong> pill on any row to flip it between{" "}
          <strong>Not Billed</strong>, <strong>Billed</strong>, and <strong>Paid</strong>, it saves
          immediately. The total at the bottom reflects everything currently shown.
        </Step>

        <Step n={3} title="Janitorial tab">
          Lists completed janitorial turnover units in range, grouped under their building, with
          bed/bath, completion date, and contract amount. Billing status works the same
          click-to-flip way as Post-Construction.
          <ImgPlaceholder label="Janitorial billing tab" />
        </Step>

        <Step n={4} title="Recurring tab">
          Lists billing periods generated from buildings&apos; recurring janitorial contracts,
          grouped under their building, one row per month. See{" "}
          <A href="/erp/help/buildings/buildings-overview">Buildings Overview</A> for how a
          recurring contract and its periods get set up in the first place.
          <ImgPlaceholder label="Recurring billing tab" />
        </Step>

        <Step n={5} title="Downloading a CSV">
          Every one of the first three tabs has a <strong>Download CSV</strong> button, top right,
          that exports exactly what&apos;s currently shown (respecting the active date range or
          search) with a running total row.
        </Step>

        <Step n={6} title="Needs Review tab">
          HubSpot invoice line items get matched automatically to a project&apos;s SOV items or a
          turnover unit. This tab is the queue of ones the system wasn&apos;t confident enough to
          apply on its own.
          <ImgPlaceholder label="Needs Review tab with a candidate match" />
          <UL>
            <LI>
              Each card shows the original HubSpot line item and amount, plus a searchable dropdown
              of likely SOV items or units to match it to.
            </LI>
            <LI>
              Pick the right match and click <strong>Confirm match</strong>, or click{" "}
              <strong>Not applicable</strong> if none of the candidates are right.
            </LI>
            <LI>
              <strong>Remember this for future invoices</strong> is checked by default, leave it
              on so the same line item text auto-matches next time instead of landing back in this
              queue.
            </LI>
          </UL>
          <Callout type="tip">
            An empty Needs Review tab is a good sign, it means every HubSpot invoice line item so
            far matched confidently on its own.
          </Callout>
        </Step>
      </Steps>

      <H3>Where billing status is also editable</H3>
      <P>
        Billing status isn&apos;t exclusive to this page. SOV items and change orders can also be
        marked billed from a project&apos;s own Financials or Change Orders tab, see{" "}
        <A href="/erp/help/projects/projects-overview">Projects Overview</A>. Either place updates
        the same underlying status.
      </P>
    </>
  );
}
