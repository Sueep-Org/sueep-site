import { A, Callout, H2, H3, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function InvoicesAndPayments() {
  return (
    <>
      <H2>What this covers</H2>
      <P>
        The <strong>Invoices</strong> page, and how an invoice goes from sent to paid. Admins, Project Managers and the
        Business Manager can open it (left menu, under Billing). For the whole billing flow, read{" "}
        <A href="/erp/help/billing/how-invoicing-works">Start Here: How Billing Works</A>.
      </P>

      <H2>The Invoices page</H2>
      <P>
        Every invoice, newest first, like HubSpot&apos;s old invoice list: every invoice in QuickBooks since January last year
        (read every morning with its payments), invoices just approved on Ready to send, and older HubSpot invoices that never
        reached QuickBooks.
      </P>
      <UL>
        <LI>
          Each row has the number, client and building or job, <strong>Work done</strong>, invoice date, due date, amount,
          balance still owed, and status.
        </LI>
        <LI>
          <strong>Work done</strong> is when the billed work was finished: one day, a range when the invoice covers several
          units or lines (&quot;Oct 3 to Oct 12, 2026&quot;), or the month for a janitorial month. It comes from the work linked
          to the invoice, so an invoice that needs linking shows a dash. Sort by it to find old unpaid work, which matters
          for lien deadlines.
        </LI>
        <LI>
          <strong>PDF</strong> next to the number opens the invoice exactly as the client sees it. No QuickBooks login is
          needed.
        </LI>
        <LI>Click Work done, Date, Due, Amount or Balance to sort by it.</LI>
        <LI>
          Click a row to open it:
          <UL>
            <LI>
              <strong>For:</strong> the work it bills, linking to its job or building and to its lines on Project Billing.
            </LI>
            <LI>
              <strong>History:</strong> everything that happened to it, oldest first: the invoice date, who approved it on
              Ready to send, who it was emailed to or who uploaded it (with the portal number, note and a{" "}
              <strong>Proof</strong> link to the screenshot), portal status changes such as sent back and resubmitted,
              follow-ups, the short pay reason, and each payment with its reference (check number and so on). Red means sent
              back, green means approved or paid.
            </LI>
            <LI>
              <strong>Status and links:</strong> whether it&apos;s still waiting to be sent, its portal status with buttons to
              change it, the short pay reason, the last follow-up with <strong>Log follow-up</strong>, the PDF,{" "}
              <strong>Open in QuickBooks</strong> and the HubSpot invoice for older ones. The buttons and Open in QuickBooks are
              for Admins and the Business Manager.
            </LI>
          </UL>
        </LI>
      </UL>
      <H3>Statuses</H3>
      <UL>
        <LI>
          <strong>Open:</strong> nothing paid yet, not yet due.
        </LI>
        <LI>
          <strong>Partly paid:</strong> some of it paid, not yet due. The rest is in Balance.
        </LI>
        <LI>
          <strong>Overdue:</strong> money still owed after the due date, with how many days late (partly paid or not).
        </LI>
        <LI>
          <strong>Paid:</strong> nothing left to pay.
        </LI>
        <LI>
          <strong>Not in QuickBooks:</strong> an older HubSpot invoice that never reached QuickBooks.
        </LI>
      </UL>
      <P>
        On unpaid invoices, one short line under the status says what matters most, in this order: a red{" "}
        <strong>Missed promise</strong>, why it was paid short (or &quot;Short, no reason yet&quot;), the portal status (for
        example &quot;Procore: Under review&quot;, red when sent back), or a promise to pay still to come.
      </P>
      <H3>Portal status</H3>
      <P>
        Invoices uploaded to Procore, Coupa or a vendor portal show where the client&apos;s portal has them: Submitted, Under
        review, Approved, Sent back or Resubmitted. After checking the portal, open the invoice and click{" "}
        <strong>Under review</strong>, <strong>Approved</strong> or <strong>Sent back</strong>. Sent back and Resubmit are
        explained in <A href="/erp/help/billing/sending-invoices">Sending Invoices: Email, Portals and Needs Sending</A>.
      </P>
      <H3>Search and Filter</H3>
      <UL>
        <LI>The search box finds an invoice by number, client, building or job.</LI>
        <LI>
          <strong>Filter</strong> narrows by status (All, Unpaid, Overdue, Paid, <strong>Missed promise</strong> and{" "}
          <strong>In portal, not approved</strong>, each with a count), client, and invoice date (This month, Last 30 days,
          This year, Last year, or your own From and To).
        </LI>
        <LI>
          The same panel has <strong>Needs a fix</strong>. When anything needs fixing, an amber &quot;need a fix&quot; link
          appears at the top.
        </LI>
      </UL>

      <H2>How an invoice gets marked paid</H2>
      <P>
        Paid status comes from QuickBooks. The ERP never needs a payment entered twice.
      </P>
      <Steps>
        <Step n={1} title="The client pays">
          By check, ACH, card, or through their portal (Procore, Coupa and so on). However they pay, the money arrives in
          Sueep&apos;s bank.
        </Step>
        <Step n={2} title="Record it in QuickBooks against the invoice">
          In QuickBooks, use <strong>Receive payment</strong>: pick the customer, tick the invoice it pays (INV-...), and save.
          Online payments through the View and pay button are recorded by QuickBooks automatically.
        </Step>
        <Step n={3} title="The ERP reads it">
          Early every morning, or straight away with <strong>Sync now</strong> on the QuickBooks page, the ERP sees the invoice
          has no balance left. The invoice shows Paid, and its work on Project Billing moves to <strong>Paid</strong> with the
          payment date.
        </Step>
      </Steps>
      <Callout type="warning">
        The payment must be applied to the invoice in QuickBooks. A deposit only categorized as income, or left in Undeposited
        Funds, leaves the invoice open: the ERP will keep showing it unpaid and it will turn Overdue. The QuickBooks
        details page lists money received that isn&apos;t attached to an invoice, so it can be applied.
      </Callout>
      <P>
        If a payment truly can&apos;t be matched in QuickBooks, mark the work <strong>Paid</strong> by hand on Project Billing.
        Hand changes are kept and never undone by the sync.
      </P>

      <H2>Chasing unpaid invoices</H2>
      <H3>Finding them</H3>
      <UL>
        <LI>
          On the Invoices page, Filter by <strong>Overdue</strong> or <strong>Missed promise</strong>, or sort by Balance.
        </LI>
        <LI>
          The dashboard&apos;s <strong>Overdue</strong> tab (Admins and the Business Manager) lists open invoices past their due
          date, and open invoices by how long ago the work was finished: 30, 60 and 90+ days. Clicking one opens it on the
          Invoices page.
        </LI>
        <LI>
          On Project Billing, filter by <strong>Billed</strong> with <strong>Since completion</strong> for the same view by
          job, with lien deadlines.
        </LI>
      </UL>
      <H3>Logging a follow-up</H3>
      <Steps>
        <Step n={1} title="Open the invoice">
          From the Overdue tab, or find it on the Invoices page and click the row.
        </Step>
        <Step n={2} title="Click Log follow-up">
          Under Status and links (Admins and the Business Manager, unpaid invoices with a number). Pick how (Email, Phone,
          Portal message, In person, Other), who you spoke to, what they said and, if they gave one, the day they promised to
          pay by.
        </Step>
        <Step n={3} title="Save">
          It shows in the invoice&apos;s History, and the last follow-up and any promise show above the button.
        </Step>
      </Steps>
      <UL>
        <LI>
          A promise still to come shows under the status as &quot;Promised Nov 10&quot;. Once that day passes unpaid, it turns
          red, &quot;Missed promise&quot;.
        </LI>
        <LI>
          On the Overdue tab, each invoice shows its last follow-up or promise. Missed promises get a red badge and move to the
          top of their group; invoices with a promise still to come move to the bottom.
        </LI>
        <LI>
          Logged one by mistake? Click <strong>Remove</strong> on that History line. Only the person who logged it, or an
          Admin, can remove it.
        </LI>
      </UL>
      <H3>Short pays</H3>
      <P>
        When a client pays part of an invoice, it shows &quot;Short, no reason yet&quot; under the status. Open it and click{" "}
        <strong>Explain short pay</strong> (Admins and the Business Manager): pick <strong>Retainage held</strong>,{" "}
        <strong>Disputed line</strong>, <strong>Back charge</strong> or <strong>Other</strong>, the amount (starts at the whole
        open balance) and a note (needed for Other). The reason then shows under the status, in History and on the
        Overdue tab. <strong>Edit short pay</strong> changes it, and <strong>Clear</strong> inside it removes it.
      </P>

      <H2>Needs a fix</H2>
      <P>Open the invoice; an amber note says what is wrong, with a button to fix it.</P>
      <UL>
        <LI>
          <strong>Needs linking:</strong> an invoice dated since August 1 that isn&apos;t tied to any work in the ERP, so its
          work never moves to Billed or Paid. Click <strong>Link to lines</strong> and pick the units, lines or months it bills.
          When the ERP can&apos;t tell which job it&apos;s for, link it from the right building&apos;s or job&apos;s{" "}
          <strong>Invoices &amp; Quotes</strong> tab.
        </LI>
        <LI>
          <strong>Paid doesn&apos;t match:</strong> the invoice and its work disagree, for example the work is marked Paid
          while the invoice still has a balance. Click <strong>Fix on Project Billing</strong> and set the right status, or
          record the payment in QuickBooks.
        </LI>
        <LI>
          <strong>Not in QuickBooks:</strong> an older HubSpot invoice that never reached QuickBooks. The bookkeeper adds it
          there.
        </LI>
        <LI>
          <strong>Short pay, no reason:</strong> partly paid and nobody has said why. Click <strong>Explain short pay</strong>{" "}
          (see Short pays above).
        </LI>
      </UL>
      <Callout type="tip">
        Make invoices on Ready to send rather than straight in QuickBooks. Invoices made there are linked to their work
        automatically, so they never need linking by hand.
      </Callout>
    </>
  );
}
