import { Callout, H2, H3, P, UL, LI } from "@/app/erp/components/help/HelpComponents";

export function ReadyToSendHelp() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        <strong>Ready to send</strong> (left menu, under Billing) is where invoices get drafted in HubSpot, checked and approved.
        Admins and the Business Manager use this page. Drafts come from two places:
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
        Both kinds show under <strong>Drafts waiting</strong> and work the same way.
      </P>
      <Callout type="info">
        A draft doesn&apos;t go to QuickBooks or to the client. Only <strong>Approve</strong> opens it in HubSpot, and HubSpot
        sends open invoices to QuickBooks.
      </Callout>

      <H2>Each month</H2>
      <UL>
        <LI>
          Check the amount, the extras and where it goes. <strong>Edit</strong> changes the monthly amount or the extras; the
          Billing page and the HubSpot draft both update.
        </LI>
        <LI>
          <strong>Approve</strong> opens the invoice in HubSpot and marks the month <strong>Billed</strong>. When the client pays,
          the month moves to <strong>Paid</strong> by itself.
        </LI>
        <LI>
          <strong>Discard</strong> deletes the draft in HubSpot. That month isn&apos;t drafted again unless you click{" "}
          <strong>Draft again</strong> in the Discarded list.
        </LI>
        <LI>Tick several and use <strong>Approve selected</strong> to approve them together.</LI>
      </UL>

      <H2>After Approve: getting it to the client</H2>
      <P>
        Approve also sends the invoice, based on where it goes (the client company&apos;s billing, or a building or project
        override). The draft card says what will happen under <strong>On Approve</strong>.
      </P>
      <UL>
        <LI>
          <strong>Email or RealPage email inbox:</strong> emailed right away from Sueep&apos;s address with the invoice PDF and
          HubSpot&apos;s view and pay link. Replies go to whoever approved it. It shows in the Email Log.
        </LI>
        <LI>
          <strong>Procore, Coupa or a vendor portal:</strong> goes on <strong>Needs sending</strong> with the portal link, the
          PDF, the login to use and each line&apos;s amount (click an amount to copy it). Upload it, then click{" "}
          <strong>Mark uploaded</strong>.
        </LI>
        <LI>
          <strong>No Send to address, method Other, or the daily email limit reached:</strong> goes on Needs sending with the
          reason. Fix it, then click <strong>Email again</strong>, or send it yourself and click <strong>Mark sent</strong>.
        </LI>
      </UL>
      <P>
        <strong>Recently sent</strong> lists what went out in the last 14 days. Needs sending also shows on the dashboard&apos;s
        Money tab.
      </P>

      <H2>Ready to bill</H2>
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
          Click <strong>Draft invoice</strong>. You get one HubSpot draft per building or job, one line per item, dated today,
          on that building&apos;s or job&apos;s HubSpot deal.
        </LI>
        <LI>
          Approving marks every item on it <strong>Billed</strong>. Discarding puts the items back on Ready to bill.
        </LI>
      </UL>
      <P>
        A group without a HubSpot deal can&apos;t be drafted here. Link the deal on the building or project first.
      </P>

      <H3>Turning it on for a contract</H3>
      <P>
        In <strong>Janitorial contracts</strong> at the bottom, tick <strong>Auto-draft</strong>. Only do this once nobody makes
        that contract&apos;s invoice by hand in HubSpot anymore, or the month gets two invoices. The{" "}
        <strong>Invoice label</strong> is the name on the line, like THE SMITH for &quot;Recurring cleaning THE SMITH&quot;.
      </P>
      <P>
        The draft goes to the same billing contact as the deal&apos;s last invoice. The due date uses the client company&apos;s
        payment terms, or the invoice date when none are set.
      </P>

      <H3>Approve is off</H3>
      <P>
        Approve stays off until an Admin turns it on. The first real invoice is approved together with the bookkeeper watching
        QuickBooks.
      </P>

      <H3>Couldn&apos;t draft</H3>
      <P>
        If HubSpot refuses a draft, the month shows under <strong>Couldn&apos;t draft</strong> with the reason. A common one is a
        building with no HubSpot deal linked. Fix it, then click <strong>Try again</strong>.
      </P>
    </>
  );
}
