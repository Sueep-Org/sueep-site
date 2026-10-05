import { Callout, H2, P, UL, LI, Steps, Step, A } from "@/app/erp/components/help/HelpComponents";

export function ManagementCalendar() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The <strong>Management</strong> tab on the Schedule page is one calendar for company deadlines: insurance
        expirations, everyone&apos;s time off, background checks, pay periods, and anything you add yourself. Only Admins
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
              <strong>Time off:</strong> every employee&apos;s and contractor&apos;s time off. Notes only show when you click
              the item.
            </LI>
            <LI>
              <strong>Background checks</strong> and <strong>Employee documents:</strong> expiration dates for active
              employees and contractors.
            </LI>
            <LI>
              <strong>Janitorial contracts ending:</strong> contract end dates.
            </LI>
            <LI>
              <strong>Payroll:</strong> the last day of each pay period. It&apos;s crossed off once that payroll is closed.
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
            <strong>Remind</strong> is a list of days, like <strong>30, 7</strong>. Every morning, Admins and PMs get one
            email listing anything that is exactly that many days away. Use <strong>0</strong> to be reminded on the day
            itself. Leave it blank for no reminders. Items marked done aren&apos;t included.
          </P>
        </Step>
      </Steps>

      <Callout type="tip">
        Starting reminders: insurance 30 and 7 days, COIs 14 days, COI requests 2 days, background checks and documents
        30 days, janitorial contracts 60 and 30 days. Time off and payroll start with no reminders.
      </Callout>
    </>
  );
}
