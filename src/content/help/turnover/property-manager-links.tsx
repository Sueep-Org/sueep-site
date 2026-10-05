import { Callout, H2, H3, P, UL, LI, Steps, Step, A, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function PropertyManagerLinks() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        Outside property managers (our clients, not Sueep staff) can get a <strong>private link</strong> to their own turnover
        calendar. There they can see every turnover at their buildings, request new ones with a price estimate, and ask to cancel
        or move one. They don&apos;t need an ERP login.
      </P>
      <P>Nothing a property manager does changes the schedule on its own. Your part:</P>
      <UL>
        <LI>Set each property manager up once and send them their link.</LI>
        <LI>Confirm or decline the turnovers they request.</LI>
        <LI>Apply or decline the cancels and new dates they ask for.</LI>
      </UL>
      <Callout type="info">
        Admins, Project Managers, Sales, and Finance can use the <strong>Property Managers</strong> page (left menu, under
        Projects). It shows prices, so other roles can&apos;t see it.
      </Callout>

      <H2>Set up a property manager</H2>
      <Steps>
        <Step n={1} title="1. Add them">
          Go to <strong>Property Managers</strong> and click <strong>+ Add property manager</strong>. Under{" "}
          <strong>From buildings</strong>, click their name if it&apos;s there. That fills in their info and every building
          they&apos;re listed on. Otherwise type their name and email. Each email can only belong to one property manager.
        </Step>
        <Step n={2} title="2. Pick their buildings">
          Search and check every building they manage. They only see turnovers at these buildings. One property manager can
          have many buildings, and one building can have more than one property manager.
        </Step>
        <Step n={3} title="3. Send them the link">
          Click <strong>Add</strong>. Their link is copied for you, so paste it into an email to them. You can copy it again any
          time by opening their row.
          <Callout type="tip">Tell them to bookmark it. The same link works for good unless you make a new one.</Callout>
        </Step>
      </Steps>

      <H2>What the property manager sees</H2>
      <UL>
        <LI>
          <strong>First time on a phone or computer:</strong> they click <strong>Email me a code</strong> and type in the 6-digit
          code we email them. After that, that device remembers them for a year. This stops a forwarded link from working on
          someone else&apos;s phone.
        </LI>
        <LI>
          <strong>A month calendar and a list</strong> of their turnovers, colored by status: Requested, Scheduled, In progress, On
          hold, and Done (the last 12 months).
        </LI>
        <LI>
          <strong>Each unit</strong> shows its dates, price, crew days, and a checklist of the work with what&apos;s done.
        </LI>
      </UL>
      <Callout type="warning">
        A unit&apos;s status comes from its project. If a finished unit isn&apos;t marked <strong>Complete</strong>, the property
        manager sees it as still in progress. Keep unit projects up to date.
      </Callout>

      <H2>A new request comes in</H2>
      <P>
        Property managers pick the unit, its size, the work, and a preferred start date. They see an estimate from the
        building&apos;s pricing package. You get a <strong>Property manager turnover request</strong> email, and the request
        shows on the dashboard (<strong>Turnover requests to answer</strong>) and on{" "}
        <strong>Property Managers → Requests</strong>.
      </P>
      <Steps>
        <Step n={1} title="1. Check it">
          Open <strong>Requests</strong>. Read the work, dates, and notes. If it includes <strong>Other</strong> work, that
          isn&apos;t in the estimate yet, so you&apos;ll need to price it.
        </Step>
        <Step n={2} title="2. Confirm it">
          Click <strong>Confirm</strong>. Set the start date, an end date if it takes more than one day, and the price (it
          starts at their estimate). Add a message if you want, then click <strong>Confirm and email</strong>. This makes the
          unit project, the same as the turnover form would, so it shows on Projects, Schedule, and Billing. The property
          manager gets an email with the date and price. If you changed the date or price, the email points that out.
        </Step>
        <Step n={3} title="Or decline it">
          Click <strong>Decline</strong> and give a reason. They see the reason in their email, and the request stays on their
          list as Declined for 30 days.
        </Step>
      </Steps>
      <Callout type="tip">After confirming, book the crew on the Schedule like any other unit.</Callout>

      <H2>Cancels and new dates</H2>
      <H3>Requests you haven&apos;t confirmed yet</H3>
      <P>
        Property managers can cancel these or change the date on their own, right away, since nothing is booked yet. You get an
        email so you know. There&apos;s nothing to do.
      </P>
      <H3>Turnovers you already confirmed</H3>
      <P>
        They can ask to cancel or move a turnover until <strong>8 AM Eastern the day before it starts</strong>. After that they
        have to email us. Their ask doesn&apos;t change anything until you answer it. You get a{" "}
        <strong>Property manager turnover change</strong> email, and it shows under{" "}
        <strong>Changes to confirmed turnovers</strong> at the top of the Requests tab.
      </P>
      <Steps>
        <Step n={1} title="1. Clear the crew first">
          If the row says <strong>crew days booked</strong>, open the unit and remove (for a cancel) or move (for a new date)
          its days on the Schedule first. That&apos;s what tells the crew. <strong>Apply</strong> stays greyed out until the
          crew days are cleared.
        </Step>
        <Step n={2} title="2. Apply it">
          Click <strong>Apply</strong>. A cancel archives the unit project. A new date moves the unit&apos;s start and end
          dates and keeps its length. The property manager gets an email.
        </Step>
        <Step n={3} title="Or decline it">
          Click <strong>Decline</strong> and give a reason. The unit stays as it is and they get an email.
        </Step>
      </Steps>
      <P>Property managers can also take back an ask before you answer it. You get an email, and there&apos;s nothing to do.</P>

      <H2>Keeping links safe</H2>
      <Table>
        <THead>
          <tr>
            <TH>If</TH>
            <TH>Do this</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Their link got forwarded or shared</TD>
            <TD>
              Open their row and click <strong>Make new link</strong>. The old link stops working and every device they signed in on
              is signed out. Send them the new link.
            </TD>
          </tr>
          <tr>
            <TD>They left the company, or we should pause their access</TD>
            <TD>
              Uncheck <strong>Link on</strong>. Their link stops working, but their history stays. Check it again to turn it back
              on.
            </TD>
          </tr>
          <tr>
            <TD>They manage a new building, or stopped managing one</TD>
            <TD>Open their row and check or uncheck the building.</TD>
          </tr>
          <tr>
            <TD>They should be removed for good</TD>
            <TD>
              Click <strong>Delete</strong>. Their past requests stay on the Requests tab.
            </TD>
          </tr>
        </tbody>
      </Table>
      <P>
        <strong>Last opened</strong> on the Property Managers page shows the last time they used their link.
      </P>

      <H2>Emails</H2>
      <P>
        All of these are on the <A href="/erp/help/notifications/notifications-overview">Notifications</A> page under Turnovers.
      </P>
      <Table>
        <THead>
          <tr>
            <TH>Email</TH>
            <TH>Goes to</TH>
            <TH>When</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Property manager sign-in code</TD>
            <TD>The property manager</TD>
            <TD>They open their link on a new device. This one can&apos;t be turned off, or they couldn&apos;t get in.</TD>
          </tr>
          <tr>
            <TD>Property manager turnover request</TD>
            <TD>Staff set on the Notifications page</TD>
            <TD>They request a turnover. Replying goes straight to them.</TD>
          </tr>
          <tr>
            <TD>Turnover request confirmed / declined</TD>
            <TD>The property manager</TD>
            <TD>You confirm or decline a request.</TD>
          </tr>
          <tr>
            <TD>Property manager turnover change</TD>
            <TD>Staff set on the Notifications page</TD>
            <TD>They cancel or move a request, ask to cancel or move a confirmed turnover, or take back an ask.</TD>
          </tr>
          <tr>
            <TD>Turnover change answered</TD>
            <TD>The property manager</TD>
            <TD>You apply or decline their cancel or new date.</TD>
          </tr>
        </tbody>
      </Table>

      <H2>Cheat sheet</H2>
      <Table>
        <THead>
          <tr>
            <TH>If this happens</TH>
            <TH>Do this</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>A client wants to see or book their turnovers</TD>
            <TD>Add them as a property manager and send them their link.</TD>
          </tr>
          <tr>
            <TD>They say the code never came</TD>
            <TD>Check their email on their row, and have them check spam. They can click Send a new code after a minute.</TD>
          </tr>
          <tr>
            <TD>They say the link doesn&apos;t work</TD>
            <TD>Check Link on is checked. If you made a new link, send them that one.</TD>
          </tr>
          <tr>
            <TD>A new request shows up</TD>
            <TD>Confirm with the date and price, or decline with a reason.</TD>
          </tr>
          <tr>
            <TD>The request has Other work</TD>
            <TD>Add its cost to the price when confirming.</TD>
          </tr>
          <tr>
            <TD>They ask to cancel or move a confirmed turnover</TD>
            <TD>Clear its crew days on the Schedule if there are any, then Apply. Or Decline with a reason.</TD>
          </tr>
          <tr>
            <TD>They see a finished unit as still in progress</TD>
            <TD>Mark that unit project Complete.</TD>
          </tr>
          <tr>
            <TD>They need a change after the deadline</TD>
            <TD>They email us. Make the change on the unit and Schedule as usual.</TD>
          </tr>
        </tbody>
      </Table>

      <H3>More detail</H3>
      <P>
        For buildings and pricing packages, see <A href="/erp/help/buildings/buildings-overview">Buildings Overview</A>. For
        turnovers made by staff, see <A href="/erp/help/turnover/creating-a-request">Creating a Turnover Request</A>.
      </P>
    </>
  );
}
