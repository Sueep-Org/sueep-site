import { Callout, H2, P, UL, LI, Steps, Step, Img } from "@/app/erp/components/help/HelpComponents";

export function ScheduleCalendarOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The Schedule page (<strong>ERP → Schedule</strong>) has two views: a month{" "}
        <strong>Calendar</strong> and a <strong>Gantt</strong> chart. The calendar shows what&apos;s
        actually happening day-by-day, driven by real logged labor rather than just a project&apos;s
        start and end dates, plus anything planned ahead of time. The Gantt shows the overall
        timeline of active projects.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Reading the calendar">
          Each day cell can show a few different kinds of colored chips, depending on what&apos;s
          happening that day.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_1.png" alt="Month calendar with colored chips" />
          <UL>
            <LI>
              <strong>Solid chip:</strong> the project actually had labor logged that day.
              Colored by project type (post-construction, janitorial, real estate, etc.).
            </LI>
            <LI>
              <strong>Dashed chip (gray):</strong> a supervisor has been assigned to that
              project/day ahead of time, but no labor has been logged yet.
            </LI>
            <LI>
              <strong>Dashed chip (red):</strong> the same as above, except the day has already
              passed and it never got logged. This flags a missed assignment.
            </LI>
            <LI>
              <strong>Amber warning chip (⚠):</strong> a project starting today or soon that has
              never had a supervisor assigned and has no logged work yet. It&apos;s rendered above
              the other chips in the cell so it can&apos;t be missed. Click it to jump straight to
              the assignment panel for that project/day (see Step 4).
            </LI>
          </UL>
          <Callout type="warning">
            Amber warning chips only appear for projects that are still active (not Complete or
            Archived) and starting today or in the future. Once a supervisor is assigned or work
            is logged, the warning clears automatically.
          </Callout>
          <Callout type="tip">
            A day cell only shows up to 4 chips at once. If there&apos;s more, click{" "}
            <strong>&quot;+N more&quot;</strong> at the bottom of the cell to see everything
            scheduled that day in a popover.
          </Callout>
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_2.png" alt="+N more popover listing everything on a day" size="sm" />
          The color key at the bottom of the Calendar section explains what each color/style means.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_3.png" alt="Calendar legend" />
        </Step>

        <Step n={2} title="Hovering for details">
          Hover over any chip to see more without clicking into the project. Solid chips
          show hours logged and who logged them; dashed chips show who&apos;s assigned and any
          workers planned for that day.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_4.png" alt="Chip tooltip showing hours and workers" />
        </Step>

        <Step n={3} title="Filtering the calendar">
          Click the filter icon (top right of the Calendar section) to narrow down what&apos;s
          shown.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_5.png" alt="Filter panel with supervisor and project type options" size="sm" />
          <UL>
            <LI>
              <strong>Supervisor:</strong> show only one supervisor&apos;s projects. Only
              available to Admins, PMs, Finance, and Estimation. Supervisors don&apos;t get this
              filter since their calendar is already scoped to their own projects (see Step 7).
            </LI>
            <LI>
              <strong>Project type:</strong> toggle which categories show up (post-construction,
              change order, janitorial, real estate, other, and change orders).
            </LI>
          </UL>
          The filter icon turns pink when a filter is active, and a &quot;Clear filters&quot;
          button appears to reset back to everything.
        </Step>

        <Step n={4} title="Assigning a supervisor to a future day">
          Click the <strong>+</strong> button in the top-right corner of any today-or-future day
          cell to open the assignment panel for that day.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_6.png" alt="Plus button on a day cell" size="sm" />
          You can also click directly on an amber warning chip (see Step 1) to open this same
          panel with that project already selected.
          Search for a project, pick a supervisor, and optionally set a time range (leave blank for
          an all-day event). Click <strong>Assign supervisor</strong>.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_7.png" alt="Assign supervisor form" />
          <Callout type="info">
            This also sets that supervisor as the project&apos;s overall supervisor on its details
            page, and sends them a calendar invite (.ics file) by email so it shows up on their
            Google/Outlook/Apple calendar automatically. Reassigning the same project/day updates
            the same invite instead of sending a duplicate.
          </Callout>
        </Step>

        <Step n={5} title="Assigning workers to a future day">
          In that same panel, scroll down to <strong>Workers scheduled</strong>. Using the project
          selected above, search for a worker by name and click <strong>Add</strong>. You can add
          as many workers as needed for that project/day.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_8.png" alt="Workers scheduled section with search" />
          <Callout type="warning">
            Worker assignments are for planning only. Unlike the supervisor assignment, no email
            or calendar invite is sent to workers (yet).
          </Callout>
        </Step>

        <Step n={6} title="Removing an assignment">
          Both supervisor and worker assignments can be removed with the small{" "}
          <strong>×</strong> button next to their name, either from inside the day panel or
          directly on a dashed chip&apos;s calendar entry. Removing a supervisor assignment also
          sends a cancellation to their calendar invite.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_9.png" alt="Removing an assignment with the x button" size="sm" />
        </Step>

        <Step n={7} title="What supervisors see">
          Supervisors only see projects on their calendar that they&apos;re assigned to (at the
          project level or for a specific day) or have personally logged labor on, not the whole
          company&apos;s schedule. This applies on both the Schedule page and the ERP dashboard.
          Everyone else (Admin, PM, Finance, Estimation) sees the full calendar.
        </Step>

        <Step n={8} title="The Gantt chart">
          Below the calendar, the Gantt chart shows a horizontal timeline of{" "}
          <strong>active</strong> projects only, using their start/end dates (a 14-day window is
          assumed if there&apos;s no end date). Projects with no end date (still open-ended, not
          finished) are listed first.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_10.png" alt="Gantt chart view" />
          Use the <strong>Today</strong> button and the arrows next to it to jump to or scroll
          around the current date. The chart opens centered on today by default. Each row also
          has a dropdown to reassign that project&apos;s supervisor directly.
        </Step>
      </Steps>
    </>
  );
}
