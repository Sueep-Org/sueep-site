import { Callout, H2, H3, P, Steps, Step, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

export function BillingOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The Project Billing page (<strong>ERP → Project Billing</strong>) is where completed work
        gets marked as billed and paid. It has three tabs: <strong>Post-Construction</strong>,{" "}
        <strong>Janitorial</strong>, and <strong>Recurring</strong>. Each lists completed work in a
        date range and lets you flip its billing status.
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
          <Callout type="info">
            A <strong>Lien deadline</strong> pill next to a project shows how many days are left
            to file a lien while work on it is unpaid. It counts from the project&apos;s completion date, turns
            amber at 60 days and red at 30. The <strong>Lien deadlines</strong> box above the
            table lists every unpaid job that is close, whatever date range is showing. Set the
            state and who hired us on the project&apos;s <strong>Financials</strong> tab. These
            are general deadlines, check with an attorney before relying on them.
          </Callout>
        </Step>

        <Step n={3} title="Janitorial tab">
          Lists completed janitorial turnover units in range, grouped under their building, with
          bed/bath, completion date, and contract amount. Billing status works the same
          click-to-flip way as Post-Construction.
          <ImgPlaceholder label="Janitorial billing tab" />
        </Step>

        <Step n={4} title="Recurring tab">
          Lists each janitorial contract&apos;s billing months, grouped under their building, one
          row per month. The amount includes any one-off extras added that month. Clicking a month
          opens the contract. See{" "}
          <A href="/erp/help/janitorial/janitorial-contracts">Janitorial Contracts</A> for how
          contracts and their months get set up in the first place.
          <ImgPlaceholder label="Recurring billing tab" />
        </Step>

        <Step n={5} title="Downloading a CSV">
          Every tab has a <strong>Download CSV</strong> button, top right,
          that exports exactly what&apos;s currently shown (respecting the active date range or
          search) with a running total row.
        </Step>

        <Step n={6} title="When a HubSpot invoice is on the wrong line">
          HubSpot invoices are matched to SOV items, change orders and units automatically. To
          fix a match, open the project or building, go to <strong>Invoices &amp; Quotes</strong>,
          and click <strong>Edit</strong> on the invoice. An invoice can cover several lines, but a
          project line holds one invoice. A <strong>not linked</strong> flag on a billing row
          means an invoice on that project still needs a line.
          <Callout type="info">
            A line or change order is marked <strong>Paid</strong> on its own when the paid
            invoices linked to it add up to its value, within $10. Linking a paid invoice by hand
            on the <strong>Invoices &amp; Quotes</strong> tab does the same. A line that is still{" "}
            <strong>Not Billed</strong> is only moved to Paid this way when a person made the link.
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
