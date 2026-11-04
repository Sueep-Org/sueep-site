import { A, Callout, H2, P, Step, Steps, UL, LI } from "@/app/erp/components/help/HelpComponents";

export function HowInvoicingWorks() {
  return (
    <>
      <Callout type="info">
        This describes the normal way, with invoices going to QuickBooks. If an Admin switches Ready to send to{" "}
        <strong>HubSpot (backup)</strong>, invoices are made in HubSpot instead, and reach QuickBooks only while HubSpot&apos;s
        invoice sync is on.
      </Callout>

      <H2>The short version</H2>
      <P>
        The ERP makes every invoice. QuickBooks keeps the books and records payments. HubSpot keeps the deals but no longer
        holds invoices.
      </P>
      <UL>
        <LI>
          <strong>ERP:</strong> what was done, what it costs, drafting, approving and sending the invoice.
        </LI>
        <LI>
          <strong>QuickBooks:</strong> the invoice itself, money owed by each client, payments and deposits.
        </LI>
      </UL>

      <H2>From finished work to paid</H2>
      <Steps>
        <Step n={1} title="Work is finished">
          A unit turn, SOV line or change order is marked done, or a janitorial month comes up on its billing day.
        </Step>
        <Step n={2} title="A draft is made">
          Janitorial months are drafted by themselves 3 days before the billing day. Other work is picked under Ready to bill on{" "}
          <A href="/erp/help/billing/ready-to-send">Ready to send</A>.
        </Step>
        <Step n={3} title="Someone checks and approves it">
          An Admin or the Business Manager checks the amount, lines and due date, then clicks Approve.
        </Step>
        <Step n={4} title="The ERP creates it in QuickBooks">
          Under the client company&apos;s customer and the building&apos;s or job&apos;s sub-customer, with the next INV number.
          The work is marked Billed.
        </Step>
        <Step n={5} title="The client gets it">
          Emailed with the QuickBooks PDF, or listed under Needs sending for portal uploads.
        </Step>
        <Step n={6} title="The client pays">
          The payment is recorded in QuickBooks. That night the ERP reads it and marks the work Paid with the payment date.
        </Step>
      </Steps>

      <H2>One-time setup</H2>
      <P>
        <A href="/erp/quickbooks/setup">Invoice setup</A> (QuickBooks page, Admin and Business Manager) links each client
        company to its QuickBooks customer and each kind of invoice line to a QuickBooks product. New companies only need it
        once. Every building and job also needs a client company before it can be invoiced.
      </P>

      <H2>Fixing invoice data</H2>
      <P>
        On the Invoices page, <strong>Filter</strong> narrows the list by status (unpaid, overdue, paid), client and invoice
        date. When something needs fixing, an amber &quot;need a fix&quot; link appears, and the Filter panel lists it under{" "}
        <strong>Needs a fix</strong>:
      </P>
      <UL>
        <LI>
          <strong>Needs linking:</strong> an invoice dated since Aug 1 that isn&apos;t tied to any work in the ERP, so its
          lines never move to Billed or Paid. Open it and click <strong>Link to lines</strong>.
        </LI>
        <LI>
          <strong>Paid doesn&apos;t match:</strong> the invoice and its lines disagree, e.g. lines marked Paid while the
          invoice is still open. Open it and click <strong>Fix on Project Billing</strong>.
        </LI>
        <LI>
          <strong>Not in QuickBooks:</strong> HubSpot invoices that never reached QuickBooks. The bookkeeper adds them there.
        </LI>
      </UL>

      <H2>Where to look</H2>
      <P>
        Three pages, one step each. The bar at the top of each shows the steps with a number for each, so you can jump to
        the next one.
      </P>
      <UL>
        <LI>
          <strong>Project Billing:</strong> every piece of work and whether it&apos;s billed. Bill it sends finished work to
          Ready to send.
        </LI>
        <LI>
          <strong>Ready to send:</strong> drafting, approving and getting invoices to the client.
        </LI>
        <LI>
          <strong>Invoices:</strong> every invoice with its status, payments and balance, like HubSpot&apos;s invoice list.
        </LI>
        <LI>
          <strong>QuickBooks page:</strong> whether the ERP and QuickBooks agree, and the money owed check.
        </LI>
      </UL>
    </>
  );
}
