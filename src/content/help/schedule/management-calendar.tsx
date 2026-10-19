import { Callout, H2, P, UL, LI, Steps, Step, A } from "@/app/erp/components/help/HelpComponents";

export function ManagementCalendar() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The <strong>Management</strong> tab on the Schedule page is one calendar for company deadlines: insurance
        expirations, everyone&apos;s time off, background checks, pay periods, birthdays, and anything you add yourself. Only Admins
        and Project Managers can see it.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="What shows up on its own">
          These categories fill in from the rest of the ERP. You don&apos;t enter them here.
          <UL>
            <LI>
              <strong>Sueep insurance:</strong> expiration dates of active policies on the{" "}
              <A href="/erp/help/insurance/insurance-overview">Insurance</A> page.
            </LI>
            <LI>
              <strong>Sub insurance:</strong> each active contractor&apos;s general liability, workers&apos; comp, auto and
              umbrella expirations, from the Insurance section of their profile. Subs marked workers&apos; comp exempt
              don&apos;t get a workers&apos; comp item.
            </LI>
            <LI>
              <strong>COIs we issued:</strong> when the current COI for each holder on an open project expires.
            </LI>
            <LI>
              <strong>COI requests due:</strong> the needed-by date on open COI requests.
            </LI>
            <LI>
              <strong>Time off:</strong> every employee&apos;s and contractor&apos;s approved and pending time off (pending is
              marked in the title, denied doesn&apos;t show). Notes only show when you click the item.
            </LI>
            <LI>
              <strong>Background checks</strong> and <strong>Employee documents:</strong> expiration dates for active
              employees and contractors.
            </LI>
            <LI>
              <strong>Janitorial contracts:</strong> contract start, expiration, and end dates.
            </LI>
            <LI>
              <strong>Payroll:</strong> the last day of each pay period. It&apos;s crossed off once that payroll is closed.
            </LI>
            <LI>
              <strong>Birthdays:</strong> every year on the date of birth saved on active employees&apos; and
              contractors&apos; profiles. People with no date of birth don&apos;t show.
            </LI>
            <LI>
              <strong>Company licenses and IDs:</strong> expiration dates on Company Info, like contractor licenses and MBE/WBE
              certifications.
            </LI>
            <LI>
              <strong>Quality checks:</strong> site visits scheduled on janitorial contracts, with who is doing them. They
              turn overdue (red outline) until the check form is finished. Open goes straight to the form.
            </LI>
          </UL>
          Click an automatic item and choose <strong>Open</strong> to go to the page where its date lives. Change it there
          and the calendar updates.
        </Step>

        <Step n={2} title="Adding your own events">
          Click <strong>Add event</strong>, or hover a day and click <strong>+</strong>. Give it a title, a category, a date
          (and an end date for something that spans days), and optional notes or a link.
          <P>
            Set <strong>Repeats</strong> to every month or every year for things like license renewals or quarterly
            filings. A repeat on the 31st lands on the last day of shorter months.
          </P>
        </Step>

        <Step n={3} title="Marking things done">
          Click an event you added and choose <strong>Mark done</strong>. It&apos;s crossed off. For a repeating event,
          only that one time is marked. An event whose date has passed without being marked done gets a red outline and
          stays in the <strong>Next 30 days</strong> list as Overdue for a month.
        </Step>

        <Step n={4} title="Filtering">
          Click the filter button next to the month to turn each category on or off. The button turns pink while
          anything is hidden, and your choice is remembered on this browser. <strong>Show all</strong> turns everything
          back on. A busy day shows a few items and a{" "}
          <strong>+N more</strong> link for the rest.
        </Step>

        <Step n={5} title="Categories and reminders">
          Click <strong>Categories</strong> to rename a category, change its color, or set its reminders. Add your own
          categories there too. A category can only be deleted once it has no events, and the automatic ones can&apos;t be
          deleted (hide them with the filter instead).
          <P>
            <strong>Remind</strong> is a list of days, like <strong>30, 7</strong>. Every morning, Admins, PMs and the Business Manager get one
            email listing anything that is exactly that many days away. Use <strong>0</strong> to be reminded on the day
            itself. Leave it blank for no reminders. Items marked done aren&apos;t included.
          </P>
        </Step>
      </Steps>

      <Callout type="tip">
        Starting reminders: insurance 30 and 7 days, COIs 14 days, COI requests 2 days, background checks and documents
        30 days, janitorial contracts 60 and 30 days, birthdays 7 days. Time off and payroll start with no reminders.
      </Callout>
      <H2>Bids</H2>
      <P>
        The <strong>Bids</strong> category shows post-construction bid due dates and job walks, from the{" "}
        <strong>Bid Date</strong> and <strong>Job Walk Date</strong> fields on HubSpot deals (refreshed every hour). Lost
        bids are left off. Click one to open the deal in HubSpot. Reminders go out 3 days and 1 day before.
      </P>
      <P>
        Sales and Estimation can open this calendar too, but they only see Bids and can&apos;t add events or change
        categories. Their reminder email has only bids.
      </P>
      <P>
        The next 30 days of bids are also on the dashboard: the <strong>Bids due</strong> card on Estimation&apos;s Queue tab,
        and the <strong>Bids</strong> card on the Sales tab (Due soon and Stale quotes). Bids due within 3 days show in red.
      </P>
            <Callout type="tip">A bid only shows here once its Bid Date is filled in on the HubSpot deal.</Callout>
      <H2>Billing cutoffs</H2>
      <P>
        The <strong>Billing cutoffs</strong> category shows the day each active job&apos;s pay app or invoice is due to the GC:
        the client company&apos;s <strong>Cutoff day</strong> (on its company page), or the job&apos;s own{" "}
        <strong>Billing cutoff day</strong> on the project&apos;s Overview when a GC uses different dates per job.
      </P>
      <UL>
        <LI>5 days before, the job&apos;s PM gets an email to update percent complete.</LI>
        <LI>
          Once the cutoff passes with no invoice for the job dated that month, it shows as <strong>Missed</strong> in red on the
          dashboard&apos;s Money tab (Needs action, Billing cutoffs), next to cutoffs coming up in the next week.
        </LI>
      </UL>
    </>
  );
}
