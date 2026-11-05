import { Callout, H2, H3, P, UL, LI, Steps, Step, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

export function BillingOverview() {
  return (
    <>
      <H2>What this page is</H2>
      <P>
        <strong>Project Billing</strong> (left menu, under Billing) lists every piece of finished work and whether it is{" "}
        <strong>Not billed</strong>, <strong>Billed</strong>, <strong>Paid</strong> or <strong>Voided</strong>. It is the first of the billing steps:
        Project Billing → Ready to send → Invoices. For how the steps fit together, read{" "}
        <A href="/erp/help/billing/how-invoicing-works">Start Here: How Billing Works</A>.
      </P>
      <P>
        Admins, Project Managers, the Business Manager and Sales can open it. Making and approving invoices happens on{" "}
        <A href="/erp/help/billing/ready-to-send">Ready to send</A>, not here.
      </P>
      <ImgPlaceholder label="Project Billing page with tabs and date range" />

      <H2>The three tabs</H2>
      <Steps>
        <Step n={1} title="Post-Construction">
          Finished Schedule of Values (SOV) lines and change orders on post-construction jobs, grouped under their job. Each
          line has its completion date, amount, billing status, invoice and <strong>Billed via</strong>.
          <ImgPlaceholder label="Post-Construction billing tab" />
        </Step>
        <Step n={2} title="Janitorial">
          Finished unit turns, grouped under their building, with bed and bath, completion date, amount, billing status and
          invoice. Change orders on unit turns are listed with their unit.
          <ImgPlaceholder label="Janitorial billing tab" />
        </Step>
        <Step n={3} title="Recurring">
          Each janitorial contract&apos;s billing months, grouped under their building, one row per month. The amount includes
          any one-off extras added to that month. Click a month to open its contract. A month is Paid once its paid invoices
          add up to its total. See <A href="/erp/help/janitorial/janitorial-contracts">Janitorial Contracts: Setup, Pricing and Billing</A> for how months
          are added.
          <ImgPlaceholder label="Recurring billing tab" />
        </Step>
      </Steps>

      <H2>Billing status</H2>
      <P>
        Click the status pill on a row to change it between <strong>Not billed</strong>, <strong>Billed</strong>,{" "}
        <strong>Paid</strong> and <strong>Voided</strong>. It saves right away and the total at the bottom updates.
      </P>
      <UL>
        <LI>
          <strong>Voided</strong> is for work that won&apos;t be billed or paid, for example the client refuses to pay or it
          doesn&apos;t need an invoice. Picking it asks why, and the reason shows when you hover the pill. Voided work leaves
          Not billed, Ready to send, lien warnings and the total, and counts as $0 revenue on the Finance dashboard (its costs
          still count). Pick another status to undo it. See <strong>Voiding work or an invoice</strong> below.
        </LI>
        <LI>
          Statuses normally move by themselves: <strong>Billed</strong> when an invoice for the work is approved on Ready to
          send, and <strong>Paid</strong> once every invoice linked to it is paid in QuickBooks. Draft and voided invoices
          don&apos;t count.
        </LI>
        <LI>
          A change you make by hand is kept. The ERP will not move it back, even if the invoice later says something else.
        </LI>
        <LI>
          Use a hand change for things the ERP cannot see, for example a payment that was never recorded against its invoice in
          QuickBooks, or work billed outside the ERP.
        </LI>
        <LI>
          The same status can also be changed on a job&apos;s Financials or Change Orders tab, and on a janitorial
          contract&apos;s Billing tab. It is one status, so a change in either place shows in both.
        </LI>
      </UL>

      <H3>Voiding work or an invoice</H3>
      <P>Voiding the work and voiding the invoice are two different things.</P>
      <UL>
        <LI>
          <strong>Voiding work</strong> (the status pill): the work won&apos;t be billed or paid. You can void it here, on a
          project&apos;s <strong>Financials</strong> tab, on a line of its <strong>Schedule of Values</strong>, or on a janitorial
          month (here, under Recurring). Each one asks why. A voided turn&apos;s project shows Voided too. Voided SOV lines
          and change orders are left out of the pay app on Needs sending, and Auto-draft skips voided janitorial months.
        </LI>
        <LI>
          <strong>Voiding work does not touch QuickBooks.</strong> If an invoice for it was already approved, that invoice
          stays open in QuickBooks, and on the Invoices page it keeps counting as owed and will turn Overdue.
        </LI>
        <LI>
          <strong>To cancel an invoice</strong>, void it in QuickBooks (the ERP never voids or deletes anything there). The
          next morning the ERP sees it, and that invoice stops counting toward the work&apos;s Billed and Paid. Work whose only
          invoice was voided shows again under <strong>Ready to bill</strong> so it can be invoiced again. Check its status
          here and set it back to Not billed if needed, or void the work too if it won&apos;t be billed at all.
        </LI>
      </UL>

      <H2>Bill it</H2>
      <P>
        Admins and the Business Manager see <strong>Bill it →</strong> on finished work that is Not billed and has no invoice.
        It opens Ready to send on the Ready to bill tab with that line already ticked, so you can draft its invoice.
      </P>

      <H2>Invoices on a line</H2>
      <P>
        Each line shows the invoices linked to it, by number. Click a number to open that invoice on the{" "}
        <A href="/erp/help/billing/invoices-and-payments">Invoices page</A>, with its balance, payments and PDF.
      </P>
      <UL>
        <LI>Invoices approved on Ready to send are linked to their lines automatically.</LI>
        <LI>
          Older HubSpot invoices were matched to lines automatically, one invoice per line. To change a match, or to link more
          than one invoice to a line (for example a line billed in parts), open the job or building, go to its{" "}
          <strong>Invoices &amp; Quotes</strong> tab and click <strong>Edit</strong> on the invoice. Unit change orders and
          janitorial months are never matched automatically, so link those by hand.
        </LI>
        <LI>
          A <strong>not linked</strong> flag next to a job means one of its HubSpot invoices still needs a line. On the
          Post-Construction tab, the job&apos;s <strong>Invoice</strong> column lists the invoices on the job&apos;s HubSpot
          deal, and shows <strong>No deal</strong> when the job has none.
        </LI>
      </UL>

      <H2>Billed via</H2>
      <P>
        Every tab has a <strong>Billed via</strong> column: how the client wants invoices sent (Email, RealPage email, Procore,
        Coupa, vendor portal or Other). It comes from the client company, unless the building or job overrides it. Click it to
        open the portal when one is saved. <strong>Not set</strong> links to the company so you can fill it in. See{" "}
        <A href="/erp/help/companies/companies-overview">Companies and Billing Info</A>.
      </P>

      <H2>Finding what you need</H2>
      <P>
        The page opens showing <strong>Not Billed</strong> work from all dates, so you see everything still waiting for an
        invoice. Opened from a job or contract link, it shows every status for that job. The filter button turns pink when
        anything other than these defaults is on; <strong>Clear filters</strong> in the menu puts them back.
      </P>
      <H3>Dates and search</H3>
      <UL>
        <LI>
          The filter button (three lines) holds the dates: <strong>All time</strong> is on by default. Untick it to pick a{" "}
          <strong>From / To</strong> range.
        </LI>
        <LI>
          Typing in the search box searches every date by job, building or unit name. The dates grey out while a search is
          active; clear the search to go back to the dates.
        </LI>
      </UL>
      <H3>Filters</H3>
      <P>
        In the same menu, pick one billing status (<strong>All</strong>, <strong>Not Billed</strong>, <strong>Billed</strong>,{" "}
        <strong>Paid</strong>, <strong>Voided</strong>) and any of the options under it. Rows must match everything picked, and the total follows.
      </P>
      <UL>
        <LI>
          <strong>Post-Construction:</strong> Overdue invoice, Lien (an invoice is late or a lien step is due), COI expiring,
          and Invoice not linked.
        </LI>
        <LI>
          <strong>Janitorial:</strong> Overdue invoice, Lien, Status doesn&apos;t match invoice (the invoice says paid or
          unpaid but the line says otherwise), and No invoice.
        </LI>
        <LI>
          <strong>Recurring:</strong> Overdue invoice and No invoice.
        </LI>
        <LI>
          <strong>Since completion:</strong> work finished 30 to 59, 60 to 89, or 90 or more days ago. Janitorial months count
          from the last day of the month. Pair it with <strong>Billed</strong> to see what is still waiting on payment.
        </LI>
      </UL>
      <H3>Download CSV</H3>
      <P>
        <strong>Download CSV</strong> (top right of each tab) exports exactly what is showing, with the dates, search and
        filters applied, and a total row.
      </P>

      <H2>Jobs past their scheduled day</H2>
      <P>
        An amber bar at the top lists jobs and change orders whose last scheduled day has passed but nobody marked complete.
        They are not billable until they are complete, so they don&apos;t appear in the tables. <strong>Mark complete</strong>{" "}
        uses the last scheduled day as the end date.
      </P>

      <H2>Liens</H2>
      <P>
        The <strong>Lien</strong> column shows where an unpaid job stands and how many days are left to file. It counts from
        the completion date. A warning mark beside a job or building means it needs a look.
      </P>
      <UL>
        <LI>
          <strong>Not due yet:</strong> nothing is late.
        </LI>
        <LI>
          <strong>Past due:</strong> an invoice is late, so a lien is possible.
        </LI>
        <LI>
          <strong>Decide on lien:</strong> time to choose whether to file.
        </LI>
        <LI>A red pill means a required notice is due or the deadline has passed.</LI>
      </UL>
      <P>
        The <strong>Lien deadlines</strong> box above the table lists every job or building past the first stage, whatever
        dates are showing (two at first, then <strong>Show all</strong>). Unit turns are tracked per building, since a lien is
        filed against the property: each unpaid turn has its own clock, and the building shows the earliest one still open.
      </P>
      <P>
        Set the state and who hired us on the job&apos;s or building&apos;s <strong>Liens</strong> tab, which also has a
        checklist of what a filing still needs. Record a <strong>Decision</strong> there once one is made: Not pursuing and
        Lien filed take it off the list. Admins and Project Managers get an email the morning a job reaches the day to decide,
        and again when a required notice is due.
      </P>
      <Callout type="warning">
        Lien deadlines here are general rules. Check with an attorney before relying on them.
      </Callout>
    </>
  );
}
