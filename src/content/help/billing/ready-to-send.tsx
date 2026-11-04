import { A, Callout, H2, H3, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function ReadyToSendHelp() {
  return (
    <>
      <H2>What this page is</H2>
      <P>
        <strong>Ready to send</strong> (left menu, under Billing) is where invoices are drafted, checked and approved. Only
        Admins and the Business Manager can open it. For how it fits with the other billing pages, read{" "}
        <A href="/erp/help/billing/how-invoicing-works">Start Here: How Billing Works</A>.
      </P>
      <P>It has four tabs. An amber dot on a tab means something there needs you.</P>
      <UL>
        <LI>
          <strong>To approve:</strong> drafts waiting to be checked and approved. Covered here.
        </LI>
        <LI>
          <strong>Ready to bill:</strong> finished work with no invoice yet, to pick and draft. Covered here.
        </LI>
        <LI>
          <strong>Needs sending:</strong> approved invoices that still have to reach the client. Covered in{" "}
          <A href="/erp/help/billing/sending-invoices">Sending Invoices: Email, Portals and Needs Sending</A>.
        </LI>
        <LI>
          <strong>Contracts:</strong> which janitorial contracts are drafted automatically. Covered here.
        </LI>
      </UL>
      <Callout type="info">
        A draft lives only in the ERP. Nothing reaches QuickBooks or the client until you click <strong>Approve</strong>, so
        you can check and change it freely.
      </Callout>

      <H2>Where drafts come from</H2>
      <UL>
        <LI>
          <strong>Janitorial months</strong> are drafted by the ERP overnight, 3 days before the contract&apos;s billing day,
          for contracts with Auto-draft on. One invoice per contract per month: the monthly amount is the first line and each
          extra added to that month is its own line. <strong>Draft due months now</strong> (top of To approve) runs the same
          check straight away.
        </LI>
        <LI>
          <strong>Unit turns, SOV lines and change orders</strong> are drafted when you pick them on the Ready to bill tab.
        </LI>
      </UL>

      <H2>Ready to bill: drafting finished work</H2>
      <P>
        This tab lists every finished unit turn, post-construction SOV line and change order that is not billed and has no
        invoice yet. Turns are grouped by building, and post-construction work by job. You can also arrive here from{" "}
        <strong>Bill it</strong> on Project Billing, with that line already ticked.
      </P>
      <Steps>
        <Step n={1} title="Tick what to bill">
          Tick single items, or the group&apos;s box for all of them. A group whose building or job has no client company
          shows that in red and can&apos;t be ticked until one is set on its page.
        </Step>
        <Step n={2} title="Change an amount if needed">
          Each item shows its amount. Change it before drafting if this invoice should charge something different, for example
          to add an Other add-on.
        </Step>
        <Step n={3} title="Draft invoice">
          Click <strong>Draft invoice</strong>. You get one draft per building or job, which then appears on To approve. The
          items leave Ready to bill while their draft is waiting.
        </Step>
      </Steps>
      <H3>How the lines are written</H3>
      <UL>
        <LI>
          <strong>Unit turns</strong> get one line per service, such as Full cleaning (2/2), Full painting (2/2), Carpet
          cleaning, Touch-up paint, Other work and the next day upcharge, each with its price. When the amount charged differs
          from the services at the building&apos;s list prices, the difference is shared across the service lines so they
          always add up to what you charge.
        </LI>
        <LI>
          <strong>SOV lines and change orders</strong> are one line each, with the line&apos;s name and the job.
        </LI>
        <LI>Every line says which building and unit, or which job, it is for.</LI>
        <LI>
          Every line carries its <strong>Service date</strong>: the day that unit, SOV line or change order was finished, or
          the first of the month for a janitorial month. Lines added with Edit lines take the date of the unit or job they are
          for. It shows on the QuickBooks invoice and PDF.
        </LI>
      </UL>

      <H2>To approve: checking a draft</H2>
      <P>
        Click a draft to open it. You see its lines, the invoice and due dates, the billing method, who it will be emailed to,
        and an <strong>On Approve</strong> line saying exactly what will happen. An amber dot by the name means there is a
        note; hover it to read it.
      </P>
      <H3>The ... menu on a draft</H3>
      <UL>
        <LI>
          <strong>Open page:</strong> the building, job or contract.
        </LI>
        <LI>
          <strong>Email me a preview:</strong> sends you the exact email and PDF the client would get, marked as a preview.
          Nothing is approved or sent to the client. Use it on the first invoice for a new client.
        </LI>
        <LI>
          <strong>Edit lines</strong> (drafts of picked work): rename, reprice, remove or add lines. Each line belongs to one
          unit or job on the invoice, picked from the <strong>For</strong> list, and that unit or job is billed the total of
          its lines. A line can be negative, like a discount, but a unit or job can&apos;t total below $0, and each keeps at
          least one line. To leave one off completely, discard and draft again. It changes this invoice only, not the
          job&apos;s own price.
        </LI>
        <LI>
          <strong>Edit amounts</strong> (janitorial months): change the monthly amount and the month&apos;s extras. This saves
          on the month itself, so Project Billing and the contract show the same.
        </LI>
        <LI>
          <strong>Edit recipients</strong> (emailed invoices): choose who gets it. See{" "}
          <A href="/erp/help/billing/sending-invoices">Sending Invoices</A>.
        </LI>
        <LI>
          <strong>Discard:</strong> drops the draft. Picked items go back on Ready to bill. A janitorial month goes under{" "}
          <strong>Discarded months</strong> at the bottom and is not drafted again unless you click{" "}
          <strong>Draft again</strong>.
        </LI>
      </UL>
      <H3>Due date</H3>
      <P>
        When the client company has payment terms (Net 30 and so on), the due date is the invoice date plus the terms. When it
        has none, open the draft and pick the due date, or leave it on the invoice date for due on receipt. Adding terms on the
        company page sets it for every future invoice.
      </P>
      <H3>Invoice date</H3>
      <P>
        A janitorial month is dated its billing day. Picked work is dated the day you approve it.
      </P>

      <H2>Approving</H2>
      <P>
        Click <strong>Approve</strong> on a draft, or tick several and click <strong>Approve selected</strong>. A box shows the
        total and what will happen; confirm it. Approve:
      </P>
      <Steps>
        <Step n={1} title="Creates the invoice in QuickBooks">
          Under the client company&apos;s QuickBooks customer, with a sub-customer for the building or job, the next INV
          number, and &quot;Attention&quot; with the job&apos;s main contact. A customer or sub-customer that isn&apos;t in
          QuickBooks yet is created the first time. No sales tax is added.
        </Step>
        <Step n={2} title="Marks the work Billed">
          The units, lines, change orders or month move to <strong>Billed</strong> on Project Billing, linked to the new invoice.
        </Step>
        <Step n={3} title="Sends it">
          Emails it to the client, or puts it on Needs sending for a portal upload. See{" "}
          <A href="/erp/help/billing/sending-invoices">Sending Invoices</A>.
        </Step>
      </Steps>
      <P>The message afterwards links to the invoice on the Invoices page.</P>
      <H3>When Approve doesn&apos;t go through</H3>
      <P>
        Approve is greyed out when the building or job has <strong>no client company</strong>; hover it to see why, set one on
        its page, then come back. Otherwise Approve stops with a message saying what to fix, for example:
      </P>
      <UL>
        <LI>
          The client company&apos;s QuickBooks customer isn&apos;t confirmed, or a kind of line has no QuickBooks product. Fix
          it on <A href="/erp/help/billing/quickbooks-setup">Invoice setup</A>.
        </LI>
        <LI>QuickBooks isn&apos;t connected. An Admin reconnects it on the QuickBooks page.</LI>
        <LI>A QuickBooks customer already has the job&apos;s name. Rename one of them.</LI>
      </UL>
      <P>
        Approve is safe to click again after an error. The invoice number is kept on the draft, and QuickBooks never makes a
        second invoice or customer from a repeat.
      </P>

      <H2>Contracts: drafting janitorial months automatically</H2>
      <P>
        The Contracts tab lists every janitorial contract with its monthly amount, billing day and the date its next draft will
        appear.
      </P>
      <UL>
        <LI>
          Tick <strong>Auto-draft</strong> to have the ERP draft that contract&apos;s invoice every month. Turn it on only once
          nobody makes that contract&apos;s invoice by hand any more, or the month gets two invoices.
        </LI>
        <LI>
          <strong>Invoice label</strong> is the name on the line, like THE SMITH for &quot;Recurring cleaning THE SMITH&quot;.
          Blank uses the building name.
        </LI>
        <LI>
          If a month can&apos;t be drafted, an amber bar on To approve says so. Open it for the reason, fix it, then click{" "}
          <strong>Try again</strong>.
        </LI>
      </UL>

      <H2>Switching to the HubSpot backup (Admins)</H2>
      <P>
        The <strong>...</strong> menu at the top right of the page says where new invoices go and lets an Admin switch.
      </P>
      <UL>
        <LI>
          <strong>Switch to HubSpot (backup)</strong> is only for when QuickBooks can&apos;t be used. New drafts are then made
          in HubSpot, and Approve opens them there. HubSpot copies invoices into QuickBooks only while its own invoice sync is
          on, so turn that on in HubSpot too.
        </LI>
        <LI>
          <strong>Switch to QuickBooks</strong> asks for the next invoice number. It is filled in from the highest number the
          ERP knows. Only change it if someone made an invoice in HubSpot that day: use the number after it.
        </LI>
        <LI>
          Drafts already waiting stay where they were made: a HubSpot draft still approves in HubSpot after switching back.
          Clear them before switching so two invoices never share a number.
        </LI>
      </UL>
      <Callout type="info">
        On a test copy of the ERP connected to QuickBooks&apos; sandbox, the button reads <strong>Test approve</strong>. It
        makes the invoice in the sandbox company, emails only you, and marks nothing billed.
      </Callout>
    </>
  );
}
