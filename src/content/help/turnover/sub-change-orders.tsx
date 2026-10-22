import { Callout, H2, P, UL, LI, Steps, Step, A, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function SubChangeOrders() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        When a sub running a turnover finds extra work (a wall to patch, an extra coat of paint, a deep clean), they can ask
        for a <strong>change order</strong> from their schedule email. They send photos and pick the issue, and see what
        they&apos;ll be paid. The property manager approves or denies it by email. When it&apos;s approved, the change order
        is added to the unit on its own.
      </P>
      <Callout type="info">
        The sub only ever sees <strong>their pay</strong>. The property manager only ever sees <strong>our charge</strong>. The
        office sees both.
      </Callout>

      <H2>How it works</H2>
      <Steps>
        <Step n={1} title="1. The sub asks">
          Every turnover invite a sub gets (when they run the day) has a pink <strong>Request a change order</strong> button,
          and the same button shows on the page after they press <strong>Confirm</strong>. It opens a page on their phone, in
          English or Spanish from their profile. They add 1 to 10 photos, pick issues from the building&apos;s list with a
          quantity, or pick <strong>Other</strong> and describe it, then press <strong>Send request</strong>. The page tells
          them not to start until it&apos;s approved.
        </Step>
        <Step n={2} title="2. It goes to the property manager, or to the office first">
          <UL>
            <LI>
              Every line from the list, and the building has a property manager email: it&apos;s emailed to the property
              manager right away.
            </LI>
            <LI>
              It has an <strong>Other</strong> line, or the building has no property manager email: it waits for the office,
              and David and Jennifer get a <strong>Sub change order to review</strong> email.
            </LI>
          </UL>
          The property manager is whoever has a property manager link for the building. If nobody does, the building&apos;s
          contact email is used.
        </Step>
        <Step n={3} title="3. The property manager answers">
          They get the photos, each line at our price, and <strong>Approve</strong> and <strong>Deny</strong> buttons. David,
          Jennifer, Nick and Edwin are copied. The buttons open a page where they press Approve, or Deny with an optional
          reason. No login needed. Replies go to their Sueep contact.
        </Step>
        <Step n={4} title="4. After the answer">
          <UL>
            <LI>
              <strong>Approved:</strong> an approved change order is added to the unit&apos;s <strong>Change Orders</strong>{" "}
              tab at our price, with the sub as its contractor and their pay as the cost. Margin, finance and payroll count it
              like any change order. The sub is told to go ahead, with their pay.
            </LI>
            <LI>
              <strong>Denied:</strong> the sub is told not to do the work.
            </LI>
          </UL>
          David, Jennifer, Nick and Edwin get a summary with both prices and the margin either way.
        </Step>
      </Steps>

      <H2>Set the prices</H2>
      <P>
        Each building has its own <strong>CO pricing package</strong>. Open the building, go to the <strong>Pricing Package</strong>{" "}
        tab, and scroll below the regular pricing package. Every building starts with the same 10 common issues, each with a{" "}
        <strong>charge</strong> (what the property manager sees) and a <strong>sub pay</strong> (what the sub sees). You can
        change prices, add issues, give them a Spanish name, turn them off, or reorder them. <strong>Reset to default</strong>{" "}
        puts the building back on the standard list. The same roles that edit the regular pricing package can edit it.
      </P>
      <P>
        <strong>Surcharges:</strong> Next day (+25%) and Weekend (+50%) to start, set per building. Only the office adds them, on
        a request. The percent goes on top of both the charge and the sub pay.
      </P>
      <Callout type="tip">Changing a building&apos;s prices only changes new requests. Requests already sent keep their prices.</Callout>

      <H2>The CO Requests tab</H2>
      <P>
        On a turnover unit, the <strong>CO Requests</strong> tab lists every request from subs, newest first. Admins, Project
        Managers and the Business Manager can see it. The dashboard&apos;s <strong>Sub change orders to review</strong> card
        lists units with requests waiting on the office.
      </P>
      <Table>
        <THead>
          <tr>
            <TH>Status</TH>
            <TH>What it means</TH>
            <TH>What to do</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Needs office</TD>
            <TD>An Other line needs a price, or the building has no property manager email.</TD>
            <TD>Type the sub pay and charge, press Save changes, then Send to property manager. Or add an email on the building.</TD>
          </tr>
          <tr>
            <TD>Not emailed yet</TD>
            <TD>It&apos;s priced, but the email to the property manager didn&apos;t go out (History says why).</TD>
            <TD>Fix the reason, then press Send to property manager.</TD>
          </tr>
          <tr>
            <TD>Waiting on property manager</TD>
            <TD>Emailed, no answer yet.</TD>
            <TD>Wait, call them, or use Mark approved / Mark denied if they answered by phone.</TD>
          </tr>
          <tr>
            <TD>Approved / Denied</TD>
            <TD>Answered. Approved ones link to their change order.</TD>
            <TD>Nothing, unless the answer was wrong (see below).</TD>
          </tr>
          <tr>
            <TD>Cancelled</TD>
            <TD>The office cancelled it. The sub was told, and the property manager&apos;s link says it was withdrawn.</TD>
            <TD>Nothing.</TD>
          </tr>
        </tbody>
      </Table>
      <UL>
        <LI>
          <strong>Change prices, quantities or remove a line:</strong> edit the boxes and press <strong>Save changes</strong>.
          If the property manager hasn&apos;t answered yet, they get an <strong>Updated</strong> email with the new prices, using
          the same link.
        </LI>
        <LI>
          <strong>Add a surcharge:</strong> pick Next day or Weekend and save.
        </LI>
        <LI>
          <strong>Cancel:</strong> press <strong>Cancel request</strong>, add a reason if you like, and the sub is emailed.
        </LI>
        <LI>
          <strong>Wrong answer?</strong> Press <strong>Change to denied</strong> or <strong>Change to approved</strong>.
          Changing an approved one to denied voids its change order and removes the sub&apos;s pay from it. Once its change
          order is completed or billed, change it on the Change Orders tab instead.
        </LI>
        <LI>
          <strong>History</strong> at the bottom of each request shows who did what and when.
        </LI>
      </UL>

      <H2>Reminders</H2>
      <UL>
        <LI>
          Weekday mornings, a property manager who hasn&apos;t answered for a business day gets a reminder. Up to 3, a business
          day apart.
        </LI>
        <LI>
          David and Jennifer get one list of requests waiting on the property manager over 2 business days, or on the office
          over 1. It comes every weekday until they&apos;re dealt with.
        </LI>
      </UL>

      <H2>Emails</H2>
      <P>
        All of these can be turned off or sent to different people on the <A href="/erp/notifications">Notifications</A> page,
        under Turnovers and Reminders.
      </P>
      <Table>
        <THead>
          <tr>
            <TH>Email</TH>
            <TH>Who gets it</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Sub change order to review</TD>
            <TD>David and Jennifer</TD>
          </tr>
          <tr>
            <TD>Sub change order for approval</TD>
            <TD>The property manager, with David, Jennifer, Nick and Edwin copied</TD>
          </tr>
          <tr>
            <TD>Sub change order answered (to the sub)</TD>
            <TD>The sub</TD>
          </tr>
          <tr>
            <TD>Sub change order answered (to the team)</TD>
            <TD>David, Jennifer, Nick and Edwin</TD>
          </tr>
          <tr>
            <TD>Sub change order cancelled</TD>
            <TD>The sub</TD>
          </tr>
          <tr>
            <TD>Sub change order approval reminder</TD>
            <TD>The property manager</TD>
          </tr>
          <tr>
            <TD>Sub change orders waiting</TD>
            <TD>David and Jennifer</TD>
          </tr>
        </tbody>
      </Table>
    </>
  );
}
