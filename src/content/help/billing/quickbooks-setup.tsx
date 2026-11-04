import { A, Callout, H2, H3, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function QuickBooksSetup() {
  return (
    <>
      <H2>What this covers</H2>
      <P>
        The <strong>QuickBooks</strong> page (left menu, under Billing): the connection to Sueep&apos;s QuickBooks company,
        the nightly sync, <strong>Invoice setup</strong>, and the <strong>Money owed check</strong>. Admins and the Business
        Manager can open it. Only an Admin can connect or disconnect QuickBooks.
      </P>

      <H2>What the ERP reads and writes</H2>
      <UL>
        <LI>
          <strong>Reads</strong>, early every morning: the Profit and Loss by month (from January last year), money owed by
          each client (A/R Aging), invoices, payments, credits, customers and products. The Finance dashboard, the Invoices
          page and Paid status all come from this.
        </LI>
        <LI>
          <strong>Writes</strong> only when an invoice is approved on Ready to send: the invoice, and its customer or
          sub-customer the first time. It never edits, voids or deletes anything already in QuickBooks.
        </LI>
      </UL>

      <H2>The connection</H2>
      <P>
        The card at the top shows the connected company, when it last synced, and any error.
      </P>
      <UL>
        <LI>
          <strong>Sync now</strong> reads QuickBooks straight away instead of waiting for the morning, for example after
          recording payments or fixing something in QuickBooks.
        </LI>
        <LI>
          If the card turns amber and says to reconnect (QuickBooks access expires after about 100 days unused, or someone
          removed it in QuickBooks), an Admin clicks <strong>Reconnect QuickBooks</strong> and signs in to Intuit with
          contact@sueep.com, which must be an admin in QuickBooks. Invoices can&apos;t be approved until it is reconnected.
        </LI>
        <LI>
          <strong>Disconnect</strong> (Admins) stops the sync and invoice creation. Nothing in QuickBooks is changed.
        </LI>
      </UL>
      <Callout type="info">
        While QuickBooks isn&apos;t connected, the page offers <strong>Upload a report</strong> instead: export the Profit
        and Loss and A/R Aging from QuickBooks once a month and upload them, so the Finance dashboard keeps working.
      </Callout>

      <H2>The status card</H2>
      <P>
        Below the connection, one card says either <strong>Everything matches</strong> (the ERP and QuickBooks agree on money
        owed and on every month not closed yet) or lists the things to fix in plain sentences. <strong>See why</strong> opens
        the detail on the Money owed check.
      </P>

      <H2>Invoice setup</H2>
      <P>
        <strong>Invoice setup</strong> (top right) decides where the ERP&apos;s invoices land in QuickBooks. It is saved in
        the ERP and only needs attention when a new client or kind of work comes along.
      </P>
      <Steps>
        <Step n={1} title="Companies: confirm each client's QuickBooks customer">
          Each client company is matched to the QuickBooks customer its invoices go under. A suggestion comes from the name:
          click <strong>Confirm</strong> to keep it, or pick another. <strong>New on first invoice</strong> means QuickBooks
          gets a new customer with the company&apos;s name the first time one of its invoices is approved. A company must be
          confirmed before its first invoice can be approved.
        </Step>
        <Step n={2} title="Jobs: check the sub-customers">
          Each building or job becomes a sub-customer under its company, worked out from the names, with nothing to confirm.
          Fix the ones listed under <strong>Jobs to fix</strong>:
          <UL>
            <LI>
              <strong>No client company:</strong> set one on the building or job.
            </LI>
            <LI>
              <strong>Name already used:</strong> another QuickBooks customer has this name. Rename the job or that customer
              before its first invoice.
            </LI>
          </UL>
        </Step>
        <Step n={3} title="Products: one for each kind of line">
          Pick the QuickBooks product or service for each kind of invoice line: Turnovers, Post-construction lines, Change
          orders, Janitorial month and Janitorial extras. This decides which income account each line is booked to.
        </Step>
      </Steps>

      <H2>Money owed check</H2>
      <P>
        Everything behind the status card, read-only. Fix differences at the source (in QuickBooks or the ERP), then click{" "}
        <strong>Sync now</strong>.
      </P>
      <H3>Money owed</H3>
      <UL>
        <LI>
          Invoices where the ERP and QuickBooks disagree on what is owed, biggest difference first. Hover a status to see what
          it usually means, for example a payment that wasn&apos;t applied or an invoice under the wrong customer.
        </LI>
        <LI>
          Money QuickBooks received, or credit owed to a client, that isn&apos;t attached to any invoice. Applying it to the
          right invoice in QuickBooks usually clears an invoice above too.
        </LI>
      </UL>
      <H3>Monthly totals</H3>
      <P>Each month&apos;s totals in both systems, with what is behind each number.</P>
      <H3>Month close</H3>
      <P>
        Once QuickBooks is finished for a month, mark it done. The Finance dashboard only counts QuickBooks costs up to that
        month, so a half-booked month never skews profit. The checklist ticks itself from the QuickBooks data where it can;
        tick the rest by hand.
      </P>

      <Callout type="tip">
        For how invoices are drafted, approved and paid, see{" "}
        <A href="/erp/help/billing/how-invoicing-works">Start Here: How Billing Works</A>.
      </Callout>
    </>
  );
}
