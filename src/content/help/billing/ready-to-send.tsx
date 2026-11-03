import { A, Callout, H2, H3, P, UL, LI } from "@/app/erp/components/help/HelpComponents";

export function ReadyToSendHelp() {
  return (
    <>
      <Callout type="info">
        This page describes invoicing through QuickBooks, which starts on the cutover day. Until then, drafts are made in
        HubSpot and Approve opens them there; everything else on the page works the same. The top right of Ready to send
        says where invoices go right now.
      </Callout>

      <H2>What this is</H2>
      <P>
        <strong>Ready to send</strong> (left menu, under Billing) is where invoices are drafted, checked, approved and sent.
        Admins and the Business Manager use this page. For the big picture, see{" "}
        <A href="/erp/help/billing/how-invoicing-works">How Invoicing Works</A>. Drafts come from two places:
      </P>
      <UL>
        <LI>
          <strong>Janitorial months</strong>, by themselves, 3 days before the contract&apos;s billing day: one invoice per
          contract per month, the monthly amount as the first line and each extra for that month as its own line.
        </LI>
        <LI>
          <strong>Ready to bill</strong>, when you pick them: any finished work that isn&apos;t billed yet, for clients that
          don&apos;t have a billing day.
        </LI>
      </UL>
      <P>
        The page has four tabs: <strong>To approve</strong> (drafts), <strong>Ready to bill</strong>,{" "}
        <strong>Needs sending</strong> and <strong>Contracts</strong>. An amber dot on a tab means something there needs
        you. Once an invoice reaches the client it leaves this page; find it on <A href="/erp/invoices">Invoices</A>.
      </P>
      <Callout type="info">
        A draft lives only in the ERP. Nothing reaches QuickBooks or the client until you click <strong>Approve</strong>.
      </Callout>

      <H2>Checking a draft</H2>
      <UL>
        <LI>
          Click a draft to see its lines, dates, where it goes and what happens on Approve. An amber dot next to the name means
          there&apos;s a note; hover it to read it.
        </LI>
        <LI>
          The <strong>...</strong> menu on each draft has <strong>Open page</strong>, <strong>Email me a preview</strong>,{" "}
          <strong>Edit amounts</strong> (janitorial months only) and <strong>Discard</strong>.
        </LI>
        <LI>
          <strong>Due date</strong>: when the client company has payment terms (Net 30...), it&apos;s the invoice date plus the
          terms. When it has none, open the draft and pick the due date; leave it on the invoice date for due on receipt.
        </LI>
        <LI>
          <strong>Email me a preview</strong> sends you the exact email the client would get, marked as a preview. Nothing is
          approved or sent to the client.
        </LI>
        <LI>
          <strong>Discard</strong> drops the draft. Picked items go back on Ready to bill. A janitorial month goes under{" "}
          <strong>Discarded months</strong> at the bottom and isn&apos;t drafted again unless you click <strong>Draft again</strong>.
        </LI>
      </UL>

      <H2>Approving</H2>
      <P>
        <strong>Approve</strong> creates the invoice in QuickBooks, marks the work <strong>Billed</strong> in the ERP and sends
        it to the client. Tick several drafts and use <strong>Approve selected</strong> to do them together.
      </P>
      <UL>
        <LI>
          The invoice goes under the client company&apos;s QuickBooks customer, with a sub-customer for the building or job,
          set on <A href="/erp/quickbooks/setup">Invoice setup</A>. A company or job that isn&apos;t in QuickBooks yet is
          added the first time it gets an invoice.
        </LI>
        <LI>It gets the next INV number, and &quot;Attention&quot; with the project contact&apos;s name.</LI>
        <LI>
          Approve is greyed out when something is missing. Hover it to see why, for example a building or job with no client
          company. Set one on its page, then come back.
        </LI>
      </UL>

      <H2>After Approve: getting it to the client</H2>
      <P>
        Where it goes depends on the client company&apos;s billing (or a building or project override). The draft card says
        what will happen under <strong>On Approve</strong>.
      </P>
      <UL>
        <LI>
          <strong>Email or RealPage email inbox:</strong> emailed right away from Sueep&apos;s address with the QuickBooks PDF
          and, when QuickBooks offers one, a pay link. Replies go to whoever approved it. It shows in the Email Log.
        </LI>
        <LI>
          <strong>Procore, Coupa or a vendor portal:</strong> goes on <strong>Needs sending</strong>. Click it for the portal
          link, the PDF, the login to use and each line&apos;s amount (click an amount to copy it). Upload it, then click{" "}
          <strong>Mark uploaded</strong>.
        </LI>
        <LI>
          <strong>No Send to address, method Other, or the daily email limit reached:</strong> goes on Needs sending with the
          reason. Fix it, then pick <strong>Email again</strong> from the ... menu, or send it yourself and click{" "}
          <strong>Mark sent</strong>.
        </LI>
      </UL>
      <P>
        After Approve, the message has a link to the invoice on <A href="/erp/invoices">Invoices</A>, where every invoice
        is listed with how it was sent and whether it&apos;s paid. Needs sending also shows on the dashboard&apos;s Money
        tab.
      </P>

      <H2>Getting paid</H2>
      <P>
        Payments are recorded in QuickBooks as usual. Every night the ERP reads them, and the work moves to{" "}
        <strong>Paid</strong> with QuickBooks&apos; payment date. Nothing to click in the ERP.
      </P>

      <H2>Ready to bill</H2>
      <P>
        You can also start from <strong>Project Billing</strong>: <strong>Bill it</strong> on a Not billed line opens this tab
        with that line already ticked.
      </P>
      <P>
        Every finished unit turn, post-construction SOV line and change order that isn&apos;t billed and has no invoice yet,
        grouped by building (turnovers) or job (post-construction).
      </P>
      <UL>
        <LI>Tick the items to bill, or the group&apos;s box for all of them.</LI>
        <LI>
          Change an amount first if needed, for example to add an &quot;Other&quot; add-on. If an amount doesn&apos;t match the
          item&apos;s value, mark it Paid by hand when the client pays.
        </LI>
        <LI>
          Click <strong>Draft invoice</strong>. You get one draft per building or job, one line per item, dated the day you
          approve it.
        </LI>
      </UL>
      <P>A group without a client company can&apos;t be drafted. Set the client company on the building or project first.</P>

      <H3>Turning it on for a contract</H3>
      <P>
        On the <strong>Contracts</strong> tab, tick <strong>Auto-draft</strong>. Only do this once nobody makes
        that contract&apos;s invoice by hand anymore, or the month gets two invoices. The <strong>Invoice label</strong> is the
        name on the line, like THE SMITH for &quot;Recurring cleaning THE SMITH&quot;.
      </P>

      <H3>Approve is off</H3>
      <P>Approve stays off until an Admin turns it on from the ... menu at the top right.</P>

      <H3>Couldn&apos;t draft</H3>
      <P>
        If a month can&apos;t be drafted, an amber bar on To approve says so. Open it for the reason, fix it, then click{" "}
        <strong>Try again</strong>.
      </P>
    </>
  );
}
