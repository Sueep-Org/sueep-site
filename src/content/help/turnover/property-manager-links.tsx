import { Callout, H2, H3, P, UL, LI, Steps, Step, A, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function PropertyManagerLinks() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        Outside property managers (our clients, not Sueep staff) can get a <strong>private page</strong> for their buildings.
        There they can see every turnover, book new ones with a price estimate, and ask to cancel or move one. They don&apos;t
        need a password or an ERP login.
      </P>
      <P>Turnover requests reach us two ways, and both land in the same place:</P>
      <UL>
        <LI>
          <strong>Their private page</strong>, for property managers we&apos;ve set up.
        </LI>
        <LI>
          <strong>The website form</strong> at sueep.com/turnover-requests, for anyone. These show a blue{" "}
          <strong>Website</strong> tag.
        </LI>
      </UL>
      <P>Nothing a client does changes the schedule on its own. Your part:</P>
      <UL>
        <LI>Set each property manager up once. The ERP emails them their page.</LI>
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
          <Callout type="tip">
            You can also start from a building: open it, and on the <strong>Details</strong> tab click <strong>+ Add</strong> under{" "}
            <strong>Property manager links</strong>. That building is picked for you.
          </Callout>
        </Step>
        <Step n={2} title="2. Pick their buildings">
          Search and check every building they manage. They only see turnovers at these buildings. One property manager can
          have many buildings, and one building can have more than one property manager.
        </Step>
        <Step n={3} title="3. Check their Sueep contact">
          <strong>Their Sueep contact</strong> starts as Nick Wehr. It&apos;s who they&apos;re told to call, on their page and in every
          email. Change it if someone else looks after them.
        </Step>
        <Step n={4} title="4. Add and email them">
          Leave <strong>Email them their link now</strong> checked and click <strong>Add</strong>. They get a welcome email with
          three simple steps and a <strong>See my turnovers</strong> button. <strong>Monday email</strong> is on too (see below).
        </Step>
      </Steps>

      <H2>What the property manager sees</H2>
      <UL>
        <LI>
          <strong>Getting in:</strong> the <strong>See my turnovers</strong> button in any email we send them signs them in, with
          nothing to type. It works for a week after the email. If they open a bookmark on a new phone or computer instead, we
          email them a 6-digit code to type in once. After that, that device remembers them for a year.
        </LI>
        <LI>
          <strong>Coming up</strong> (the first screen): what&apos;s waiting on us, what&apos;s being worked on now, and
          what&apos;s booked in the next 14 days. <strong>Calendar</strong> shows the month, and <strong>All</strong> lists
          everything, including finished units from the last year.
        </LI>
        <LI>
          <strong>Status words they see:</strong> Requested, Booked, Being worked on, On hold, Done, and Declined.
        </LI>
        <LI>
          <strong>Each unit</strong> shows its dates, price, crew days, and a checklist of the work with what&apos;s done.
        </LI>
        <LI>
          <strong>Booking:</strong> they tap <strong>Book a turnover</strong>, enter the unit, work, and start date, and see an
          estimate from the building&apos;s pricing package. Units we&apos;ve turned before fill in their size, and{" "}
          <strong>Same as last time</strong> checks last time&apos;s work. They can add up to 10 units in one booking. All
          units start on the same date unless they tap <strong>Change date</strong> on a unit to give it its own.
        </LI>
        <LI>A bar at the top says who to call: their Sueep contact&apos;s name and phone number.</LI>
      </UL>
      <Callout type="warning">
        A unit&apos;s status comes from its project. If a finished unit isn&apos;t marked <strong>Complete</strong>, the property
        manager sees it as still being worked on. Keep unit projects up to date.
      </Callout>

      <H2>A new request comes in</H2>
      <P>
        You get a <strong>Property manager turnover request</strong> email (one per booking, listing every unit). The request
        shows on the dashboard (<strong>Turnover requests to answer</strong>) and on{" "}
        <strong>Property Managers → Requests</strong>, one row per unit.
      </P>
      <Steps>
        <Step n={1} title="1. Check it">
          Open <strong>Requests</strong>. Read the work, dates, and notes. Website requests also show the person&apos;s email and
          phone. If a request includes <strong>Other</strong> work, that isn&apos;t in the estimate yet.
        </Step>
        <Step n={2} title="2. Confirm it">
          If their date and the estimate are fine, click <strong>Confirm</strong>. That&apos;s it. To change the date, add an end
          date, change the price, or add a message, click <strong>Change</strong> instead. Requests with Other work always open
          the form, so you can price it.
          <P>
            Confirming makes the unit project, the same as the turnover form would, so it shows on Projects, Schedule, and
            Billing. The property manager gets an email with the date, the price, and a calendar file they can open to add it to
            their own calendar. If you changed the date or price, the email points that out.
          </P>
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
        have to call or email us. Their ask doesn&apos;t change anything until you answer it. You get a{" "}
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
          dates and keeps its length, and their email includes an updated calendar file.
        </Step>
        <Step n={3} title="Or decline it">
          Click <strong>Decline</strong> and give a reason. The unit stays as it is and they get an email.
        </Step>
      </Steps>
      <P>Property managers can also take back an ask before you answer it. You get an email, and there&apos;s nothing to do.</P>

      <H2>Reminders and the Monday email</H2>
      <UL>
        <LI>
          <strong>For staff:</strong> weekday mornings, if any request or change has waited over a business day, the people set
          on the Notification Management page get a <strong>Property manager requests waiting</strong> email. It repeats each weekday until
          they&apos;re answered.
        </LI>
        <LI>
          <strong>For property managers:</strong> Monday mornings, each one gets <strong>Your turnovers this week</strong>: what
          we&apos;re working on that week and anything still waiting on us. It&apos;s skipped when there&apos;s nothing. To stop
          it for one person, open their row and uncheck <strong>Monday email</strong>.
        </LI>
      </UL>

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
            <TD>They lost their link</TD>
            <TD>
              Open their row and click <strong>Email them their link</strong>. They get the welcome email again.
            </TD>
          </tr>
          <tr>
            <TD>Their link or an email from us got forwarded</TD>
            <TD>
              Open their row and click <strong>Make new link</strong>. The old link stops working, every device they signed in on
              is signed out, and the buttons in emails we already sent stop working. Then click <strong>Email them their link</strong>.
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
        <strong>Last opened</strong> on the Property Managers page, and on the building&apos;s Details tab, shows the last time
        they used their page.
      </P>

      <H2>Emails</H2>
      <P>
        All of these are on the <A href="/erp/help/notifications/notifications-overview">Notification Management</A> page, under Turnovers
        or Reminders.
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
            <TD>Property manager welcome</TD>
            <TD>The property manager</TD>
            <TD>You add them with Email them their link now checked, or click Email them their link.</TD>
          </tr>
          <tr>
            <TD>Property manager sign-in code</TD>
            <TD>The property manager</TD>
            <TD>They open a bookmark on a new device. This one can&apos;t be turned off, or they couldn&apos;t get in.</TD>
          </tr>
          <tr>
            <TD>Property manager turnover request</TD>
            <TD>Staff set on the Notification Management page</TD>
            <TD>Someone books on their page or the website form. Replying goes straight to them.</TD>
          </tr>
          <tr>
            <TD>Turnover request confirmed / declined</TD>
            <TD>The property manager</TD>
            <TD>You confirm or decline a request. Confirmed emails include the calendar file.</TD>
          </tr>
          <tr>
            <TD>Property manager turnover change</TD>
            <TD>Staff set on the Notification Management page</TD>
            <TD>They cancel or move a request, ask to cancel or move a confirmed turnover, or take back an ask.</TD>
          </tr>
          <tr>
            <TD>Turnover change answered</TD>
            <TD>The property manager</TD>
            <TD>You apply or decline their cancel or new date.</TD>
          </tr>
          <tr>
            <TD>Property manager weekly turnovers</TD>
            <TD>Each property manager with Monday email on</TD>
            <TD>Monday mornings, when they have something that week or waiting.</TD>
          </tr>
          <tr>
            <TD>Property manager requests waiting</TD>
            <TD>Staff set on the Notification Management page</TD>
            <TD>Weekday mornings, when something has waited over a business day.</TD>
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
            <TD>Add them as a property manager. The welcome email does the rest.</TD>
          </tr>
          <tr>
            <TD>They can&apos;t find their page</TD>
            <TD>Click Email them their link on their row.</TD>
          </tr>
          <tr>
            <TD>They say the code never came</TD>
            <TD>Check their email on their row, and have them check spam. Or send them the welcome email, whose button needs no code.</TD>
          </tr>
          <tr>
            <TD>They say the link doesn&apos;t work</TD>
            <TD>Check Link on is checked. If you made a new link, send them the welcome email again.</TD>
          </tr>
          <tr>
            <TD>A new request shows up</TD>
            <TD>Click Confirm, or Change to adjust the date or price first, or Decline with a reason.</TD>
          </tr>
          <tr>
            <TD>The request has Other work</TD>
            <TD>Click Confirm and add its cost to the price.</TD>
          </tr>
          <tr>
            <TD>A website request comes from someone new</TD>
            <TD>Confirm or decline it as usual. To give them their own page, add them as a property manager.</TD>
          </tr>
          <tr>
            <TD>They ask to cancel or move a confirmed turnover</TD>
            <TD>Clear its crew days on the Schedule if there are any, then Apply. Or Decline with a reason.</TD>
          </tr>
          <tr>
            <TD>They see a finished unit as still being worked on</TD>
            <TD>Mark that unit project Complete.</TD>
          </tr>
          <tr>
            <TD>They need a change after the deadline</TD>
            <TD>They call or email us. Make the change on the unit and Schedule as usual.</TD>
          </tr>
          <tr>
            <TD>They don&apos;t want the Monday email</TD>
            <TD>Uncheck Monday email on their row.</TD>
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
