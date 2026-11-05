import { A, Callout, H2, H3, P, UL, LI, Steps, Step, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function SendingInvoices() {
  return (
    <>
      <H2>What this covers</H2>
      <P>
        What happens to an invoice after you click Approve on Ready to send: who it is emailed to, how portal invoices are
        uploaded and tracked (proof, portal status, sent back), and the <strong>Needs sending</strong> tab. Drafting and approving are in{" "}
        <A href="/erp/help/billing/ready-to-send">Ready to Send: Drafting and Approving Invoices</A>. Admins and the Business
        Manager use these pages.
      </P>

      <H2>What happens on Approve</H2>
      <P>
        It depends on the billing method of the client company, or of the building or job when it has its own. The draft
        says which before you approve, under <strong>On Approve</strong>.
      </P>
      <Table>
        <THead>
          <tr>
            <TH>Billing method</TH>
            <TH>What happens</TH>
            <TH>Your part</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Email, RealPage email inbox</TD>
            <TD>Emailed right away to the To and Cc addresses, with the PDF attached.</TD>
            <TD>Nothing, unless it lands on Needs sending.</TD>
          </tr>
          <tr>
            <TD>Procore, Coupa, vendor portal</TD>
            <TD>
              Not emailed. Goes on <strong>Needs sending</strong> marked for upload, with the portal link, PDF and amounts.
            </TD>
            <TD>Upload it to the portal, then click Mark uploaded with the portal number or a screenshot.</TD>
          </tr>
          <tr>
            <TD>Other, or nothing set</TD>
            <TD>Goes on Needs sending with the reason.</TD>
            <TD>Send it yourself, then click Mark sent.</TD>
          </tr>
        </tbody>
      </Table>
      <Callout type="info">
        Portal clients only get the portal upload, the same as when invoices were sent from HubSpot. If a portal client also
        wants an email copy, download the PDF from Needs sending and email it yourself.
      </Callout>

      <H2>The invoice email</H2>
      <UL>
        <LI>
          Sent from Sueep&apos;s email address. The subject reads &quot;Invoice INV-1234 from Sueep: building or job&quot;.
        </LI>
        <LI>
          The QuickBooks invoice PDF is attached, in the style set on QuickBooks&apos; invoice template.
        </LI>
        <LI>
          A <strong>View and pay invoice</strong> button is included when QuickBooks Payments is on for Sueep&apos;s company,
          so the client can pay online.
        </LI>
        <LI>Replies go to whoever approved it.</LI>
        <LI>
          It is logged in the Email Log, and the invoice&apos;s History on the Invoices page shows &quot;Emailed to ...&quot;
          with the date.
        </LI>
        <LI>
          The ERP sends at most 100 emails a day, counting each To and Cc address. Past that, the invoice goes on Needs sending
          and can be emailed again the next day.
        </LI>
      </UL>
      <P>
        To see exactly what the client will get before approving, use <strong>Email me a preview</strong> in the draft&apos;s
        ... menu.
      </P>

      <H2>Who the invoice is emailed to</H2>
      <H3>The default: billing settings</H3>
      <P>
        Each client company has a <strong>Send to</strong> and <strong>Cc</strong> list in its billing settings. A building
        or job can override them, for example when one property has its own billing inbox. The most specific one wins: the
        job, then the building, then the company. Set these up once, as explained in{" "}
        <A href="/erp/help/companies/companies-overview">Companies and Billing Info</A>.
      </P>
      <H3>Changing it for one invoice: Edit recipients</H3>
      <P>
        Open a draft on To approve. Under the lines it shows <strong>To</strong>, <strong>Cc</strong> and, in grey, where they
        come from (for example &quot;UDR billing settings&quot;). Click <strong>Edit</strong>, or pick{" "}
        <strong>Edit recipients</strong> from the ... menu.
      </P>
      <Steps>
        <Step n={1} title="Pick To, Cc or Off for each person">
          The list has the client company&apos;s contacts and, for a job, the job&apos;s contacts, each with their role.
          Anyone already getting the invoice who isn&apos;t a saved contact shows as Other.{" "}
          <strong>All contacts to To</strong> puts every saved contact in To.
        </Step>
        <Step n={2} title="Add anyone else">
          Type an address in <strong>Other email</strong> and click <strong>Add</strong>. It goes in To; switch it to Cc if
          needed.
        </Step>
        <Step n={3} title="Choose whether to keep it">
          Leave <strong>Also use for future invoices</strong> unticked to change only this invoice. Tick it to also save the
          list as the building&apos;s or job&apos;s billing override, so later invoices go to the same people.
        </Step>
        <Step n={4} title="Save">
          At least one person must be in To. The draft then says &quot;Set on this invoice&quot;, and the Approve box lists the
          new people.
        </Step>
      </Steps>
      <P>
        <strong>Use billing settings</strong> in the same box undoes the change and goes back to the defaults. Invoices for
        portal or Other clients have no recipients, because nothing is emailed.
      </P>
      <Callout type="tip">
        If a contact you need isn&apos;t in the list, add them to the client company&apos;s contacts (Companies page) or the
        job&apos;s contacts, and they will be offered on every future invoice.
      </Callout>

      <H2>The Needs sending tab</H2>
      <P>
        Every approved invoice that the ERP couldn&apos;t deliver by itself waits here until someone finishes it, so nothing
        is forgotten, along with portal invoices the client sent back. The count also shows on the dashboard&apos;s Money
        tab (Needs action, Ready to send). Each row shows the invoice number, client, total and the reason. Sent-back
        invoices come first, then missed cutoffs, then cutoffs coming up, then the rest. Click a row to see each line&apos;s amount and the portal login to use (saved on Company Info).
        Its ... menu has the portal link (<strong>Open Procore</strong> and so on), <strong>Invoice PDF</strong>,{" "}
        <strong>Open in QuickBooks</strong>, the <strong>Client pay link</strong> and the <strong>Company page</strong>.
      </P>
      <P>
        <strong>Cutoff warnings:</strong> when the job or its client company has a billing cutoff day, an invoice still here
        within 5 days of it gets an amber &quot;Cutoff Nov 20, 3 days left&quot;, and a red &quot;Missed cutoff Nov 20&quot;
        once it passes. The cutoff that counts is the first one on or after the day the invoice was approved. The same
        warnings show on the dashboard&apos;s Money tab under Needs action, Ready to send. Set the cutoff day on the company
        page, or on the job&apos;s Overview when it differs.
      </P>
      <H3>Portal uploads</H3>
      <Steps>
        <Step n={1} title="Open the portal">
          Use the portal link in the ... menu. Click the row to see which login to use.
        </Step>
        <Step n={2} title="Upload the PDF">
          Download <strong>Invoice PDF</strong>. Type the amounts the portal asks for: click any amount in the open row to copy
          it. Use the same invoice number (INV-...) so the payment can be matched later. For a post-construction job, the open
          row shows the whole job as a <strong>Pay app</strong>: every SOV line and change order in SOV order with Scheduled,
          Previous (earlier invoices), This period (this invoice), To date, % and Balance, the way Procore asks for them.
          Lines this invoice bills are shaded. If This period doesn&apos;t add up to the invoice, a note says so (part of the
          invoice isn&apos;t linked to an SOV line).
        </Step>
        <Step n={3} title="Take a screenshot">
          Once it&apos;s submitted, screenshot the invoice in the portal or its confirmation, and note the number the portal
          gave it (for Procore, the pay app or invoice number).
        </Step>
        <Step n={4} title="Mark uploaded">
          Add the portal number, the screenshot or both (one is needed), and a note if useful. The row leaves the list, and
          the invoice&apos;s History on the Invoices page shows who uploaded it, where, when and the portal number, with a{" "}
          <strong>Proof</strong> link to the screenshot. If the client says they never got it, open the invoice there.
        </Step>
      </Steps>
      <H3>After the upload: portal status</H3>
      <P>
        An uploaded invoice starts as <strong>Submitted</strong>. When you check the portal, open the invoice on the{" "}
        <A href="/erp/invoices">Invoices</A> page and click what the portal shows: <strong>Under review</strong>,{" "}
        <strong>Approved</strong> or <strong>Sent back</strong>. The invoice row shows it under the paid status (for example
        &quot;Procore: Under review&quot;), and the Filter button&apos;s <strong>In portal, not approved</strong> lists every
        unpaid upload the client hasn&apos;t approved yet. Paid still comes from QuickBooks.
      </P>
      <UL>
        <LI>
          <strong>Sent back</strong> asks why. The person who uploaded it gets an email (also in their inbox), and the invoice
          goes back on Needs sending at the top, in red with the reason.
        </LI>
        <LI>
          Fix it in the portal, then click <strong>Resubmit</strong>. Add the new portal number or a screenshot (one is
          needed). It becomes <strong>Resubmitted</strong> and leaves the list.
        </LI>
        <LI>
          Every change is saved with who made it and when, and shows in the invoice&apos;s History. Admins can add more people
          to the &quot;Invoice sent back&quot; email on the <strong>Notifications</strong> page.
        </LI>
      </UL>
      <H3>Emails that couldn&apos;t be sent</H3>
      <P>The reason says what went wrong:</P>
      <UL>
        <LI>
          <strong>No Send to address</strong> or no billing method: add one on the company, building or job, then pick{" "}
          <strong>Email again</strong> from the ... menu.
        </LI>
        <LI>
          <strong>Daily email limit reached:</strong> pick Email again the next day.
        </LI>
        <LI>
          <strong>Email failed</strong> (for example a bad address): fix the address, then Email again.
        </LI>
        <LI>
          <strong>Method Other</strong>: send it the way that client wants, then click <strong>Mark sent</strong>.
        </LI>
      </UL>
      <P>
        You can always send it yourself (download the PDF from the ... menu) and click <strong>Mark sent</strong>. Mark sent
        can also take a file (the email you sent, a mailing receipt) and a note; neither is required.
      </P>
    </>
  );
}
