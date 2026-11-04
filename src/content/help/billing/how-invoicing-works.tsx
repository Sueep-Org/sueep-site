import { A, Callout, H2, H3, P, Step, Steps, UL, LI, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function HowInvoicingWorks() {
  return (
    <>
      <P>
        Read this first. It explains how billing fits together from start to finish and which article covers each part in
        detail. The other billing articles only cover their own page, so nothing is explained twice.
      </P>

      <H2>The short version</H2>
      <P>
        The ERP decides what to bill, makes every invoice and sends it to the client. QuickBooks keeps the books: the invoice
        itself, what each client owes, and the payments that come in. HubSpot keeps sales deals but no longer makes invoices.
      </P>
      <Table>
        <THead>
          <tr>
            <TH>System</TH>
            <TH>What it does for billing</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>ERP</TD>
            <TD>
              Knows what work is finished and what it costs. Drafts invoices, lets you check and edit them, creates them in
              QuickBooks on Approve, emails them to the client or lists them for a portal upload, and tracks billed and paid.
            </TD>
          </tr>
          <tr>
            <TD>QuickBooks</TD>
            <TD>
              Holds the official invoice, its number and PDF, the money owed by each client, and every payment. The ERP reads it
              early every morning.
            </TD>
          </tr>
          <tr>
            <TD>HubSpot</TD>
            <TD>
              Sales deals only. Older invoices made in HubSpot still show in the ERP. HubSpot is only used for new invoices if an
              Admin switches Ready to send to the HubSpot backup.
            </TD>
          </tr>
        </tbody>
      </Table>

      <H2>From finished work to paid, step by step</H2>
      <Steps>
        <Step n={1} title="The work is finished">
          A unit turn, a post-construction SOV line or a change order is marked complete, or a janitorial contract reaches its
          billing day. It shows on <strong>Project Billing</strong> as <strong>Not billed</strong>.
        </Step>
        <Step n={2} title="A draft invoice is made">
          Janitorial months with Auto-draft on are drafted by the ERP 3 days before the billing day. Unit turns, SOV lines and
          change orders are drafted when an Admin or the Business Manager picks them under <strong>Ready to bill</strong>. The
          draft stays in the ERP. Nothing is sent yet.
        </Step>
        <Step n={3} title="Someone checks it">
          On <strong>Ready to send</strong>, an Admin or the Business Manager opens the draft and checks the lines, the total,
          the due date and who it goes to. Lines, amounts and recipients can be changed here.
        </Step>
        <Step n={4} title="Approve">
          Approve creates the invoice in QuickBooks with the next INV number and marks the work <strong>Billed</strong> in the
          ERP.
        </Step>
        <Step n={5} title="The client gets it">
          Email clients are emailed right away with the PDF. Portal clients (Procore, Coupa, vendor portals) go on{" "}
          <strong>Needs sending</strong> so someone uploads the PDF to the portal.
        </Step>
        <Step n={6} title="The client pays">
          The payment is recorded in QuickBooks with <strong>Receive payment</strong>, applied to that invoice. The next morning
          the ERP reads it and marks the work <strong>Paid</strong> with the payment date.
        </Step>
      </Steps>

      <H2>Which page does what</H2>
      <P>
        The billing pages are steps in that order. The bar at the top of each one shows the steps, with a count on each, so you
        can jump to the next.
      </P>
      <Table>
        <THead>
          <tr>
            <TH>Page</TH>
            <TH>Use it to</TH>
            <TH>Read</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Project Billing</TD>
            <TD>See every piece of finished work and whether it is billed and paid. Change a status by hand. Watch liens.</TD>
            <TD>
              <A href="/erp/help/billing/billing-overview">Project Billing: Billed and Paid Status</A>
            </TD>
          </tr>
          <tr>
            <TD>Ready to send: To approve, Ready to bill, Contracts</TD>
            <TD>Make drafts, check and edit them, approve them. Turn on Auto-draft for janitorial contracts.</TD>
            <TD>
              <A href="/erp/help/billing/ready-to-send">Ready to Send: Drafting and Approving Invoices</A>
            </TD>
          </tr>
          <tr>
            <TD>Ready to send: Needs sending</TD>
            <TD>Finish invoices that could not be emailed: portal uploads, missing addresses, failed emails.</TD>
            <TD>
              <A href="/erp/help/billing/sending-invoices">Sending Invoices: Email, Portals and Needs Sending</A>
            </TD>
          </tr>
          <tr>
            <TD>Invoices</TD>
            <TD>Every invoice with its balance, payments and PDF. Find unpaid and overdue invoices. Fix mismatches.</TD>
            <TD>
              <A href="/erp/help/billing/invoices-and-payments">Invoices Page and Getting Paid</A>
            </TD>
          </tr>
          <tr>
            <TD>QuickBooks</TD>
            <TD>The connection, the nightly sync, Invoice setup, and checks that the ERP and QuickBooks agree.</TD>
            <TD>
              <A href="/erp/help/billing/quickbooks-setup">QuickBooks Page and Invoice Setup</A>
            </TD>
          </tr>
        </tbody>
      </Table>
      <P>
        Where each client wants invoices sent (email, RealPage, Procore...) is set on the client company, and a building or
        job can override it. See <A href="/erp/help/companies/companies-overview">Companies and Billing Info</A>.
      </P>

      <H2>Who can do what</H2>
      <Table>
        <THead>
          <tr>
            <TH>Role</TH>
            <TH>Billing access</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Admin</TD>
            <TD>
              Everything below, plus connecting QuickBooks and switching Ready to send between QuickBooks and the HubSpot backup.
            </TD>
          </tr>
          <tr>
            <TD>Business Manager</TD>
            <TD>
              Ready to send (draft, edit, approve, discard, Needs sending), the QuickBooks page and Invoice setup, editing
              company billing settings, the Overdue tab.
            </TD>
          </tr>
          <tr>
            <TD>Project Manager</TD>
            <TD>Project Billing and the Invoices page. Can change billing status by hand. Cannot approve invoices.</TD>
          </tr>
          <tr>
            <TD>Sales</TD>
            <TD>Project Billing.</TD>
          </tr>
        </tbody>
      </Table>

      <H2>What the statuses mean</H2>
      <H3>On the work (Project Billing)</H3>
      <UL>
        <LI>
          <strong>Not billed:</strong> finished, but no invoice has been approved for it yet.
        </LI>
        <LI>
          <strong>Billed:</strong> an invoice was approved and sent. Waiting for payment.
        </LI>
        <LI>
          <strong>Paid:</strong> every invoice linked to it is paid in QuickBooks, or someone marked it Paid by hand.
        </LI>
      </UL>
      <P>
        These move by themselves when invoices are approved and paid. If you change one by hand, the ERP keeps your change and
        does not move it back.
      </P>
      <H3>On the invoice (Invoices page)</H3>
      <UL>
        <LI>
          <strong>Unpaid:</strong> money still owed, not yet past the due date.
        </LI>
        <LI>
          <strong>Overdue:</strong> money still owed after the due date. The pill shows how many days late.
        </LI>
        <LI>
          <strong>Paid:</strong> nothing left to pay.
        </LI>
        <LI>
          <strong>Not in QuickBooks:</strong> an older HubSpot invoice that never reached QuickBooks.
        </LI>
      </UL>

      <Callout type="tip">
        Most billing problems come from one of three things: a building or job with no client company, a client company with
        no billing method or Send to address, or a payment in QuickBooks that was not applied to its invoice. The articles
        above explain how to spot and fix each one.
      </Callout>

      <H2>The HubSpot backup</H2>
      <P>
        If QuickBooks cannot be used, an Admin can switch Ready to send to <strong>HubSpot (backup)</strong>. New drafts are
        then made in HubSpot and reach QuickBooks only while HubSpot&apos;s own invoice sync is on. Everything else on the
        billing pages works the same. See{" "}
        <A href="/erp/help/billing/ready-to-send">Ready to Send: Drafting and Approving Invoices</A> for switching.
      </P>
    </>
  );
}
