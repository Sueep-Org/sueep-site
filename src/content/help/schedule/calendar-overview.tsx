import { Callout, H2, P, UL, LI, Steps, Step, Img, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

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
              <strong>Dashed chip (gray):</strong> a supervisor or PM has been assigned to that
              project/day ahead of time, but no labor has been logged yet.
            </LI>
            <LI>
              <strong>Dashed chip (red) with a red ⚠:</strong> the same as above, except the day
              has already passed and it never got logged. This flags a missed assignment.
            </LI>
            <LI>
              <strong>Amber warning chip (⚠):</strong> a project starting today or soon that has
              never had a supervisor assigned and has no logged work yet. It&apos;s rendered above
              the other chips in the cell so it can&apos;t be missed.
            </LI>
          </UL>
          <Callout type="warning">
            The two ⚠ symbols mean different things, even though they look similar. <strong>Amber</strong>{" "}
            means &quot;needs a supervisor,&quot; <strong>red</strong> means &quot;was scheduled but
            labor was never logged.&quot; Amber warning chips only appear for projects that are
            still active (not Complete or Archived) and starting today or in the future. Once a
            supervisor is assigned or work is logged, the warning clears automatically.
          </Callout>
          <Callout type="tip">
            A day cell only shows up to 4 chips at once. If there&apos;s more, click{" "}
            <strong>&quot;+N more&quot;</strong> at the bottom of the cell to see everything
            scheduled that day in a popover.
          </Callout>
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_2.png" alt="+N more popover listing everything on a day" size="sm" />
          The color key at the bottom of the Calendar section explains what each color/style
          means, including both ⚠ symbols above.
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
              filter since their calendar is already scoped to their own projects (see the last
              step below).
            </LI>
            <LI>
              <strong>Project type:</strong> toggle which categories show up (post-construction,
              change order, janitorial, real estate, other, and change orders).
            </LI>
          </UL>
          The filter icon turns pink when a filter is active, and a &quot;Clear filters&quot;
          button appears to reset back to everything.
        </Step>

        <Step n={4} title="Clicking a chip: the event card">
          Click any amber, gray-dashed, or solid (not-yet-fully-logged) project chip to open its{" "}
          <strong>event card</strong>, centered on the screen, like a Google Calendar event
          popup.
          <ImgPlaceholder label="Event card open on a chip, showing Start/End date, Coverage, and Workers sections" />
          The card has three parts:
          <UL>
            <LI>
              <strong>Start date / End date:</strong> the project&apos;s own scheduling window.
              Editing these and clicking <strong>Save dates</strong> moves the project itself, not
              just this one day.
            </LI>
            <LI>
              <strong>Coverage for this day:</strong> Supervisor and PM dropdowns for this
              specific day, saved independently with <strong>Save coverage</strong>. This is what
              fills in the amber warning chip&apos;s missing supervisor.
            </LI>
            <LI>
              <strong>Workers scheduled this day:</strong> add or remove workers (employees or
              contractors) planned for this project on this day.
            </LI>
          </UL>
          <Callout type="warning">
            If you try to add a worker who&apos;s already scheduled on a <em>different</em>{" "}
            project that same day, the card warns you before adding them. You can still add them
            anyway (e.g. splitting a shift), but it won&apos;t happen silently.
          </Callout>
          A <strong>View project</strong> link at the bottom takes you to the full project page.
        </Step>

        <Step n={5} title="Moving a planned chip's date">
          A gray or red dashed chip (a planned assignment, not yet logged) opens the same event
          card, but with a <strong>Planned date</strong> field instead of Start/End date, plus an
          optional time range.
          <ImgPlaceholder label="Event card open on a dashed/planned chip, showing the Planned date field and time range" size="sm" />
          Changing the planned date and clicking <strong>Save planned date</strong> moves just that
          day&apos;s assignment (and any workers already scheduled on it) to the new day. It does{" "}
          <strong>not</strong> change the project&apos;s overall Start/End date.
        </Step>

        <Step n={6} title="Confirmed chips: the read-only labor card">
          Clicking a <strong>solid</strong> chip that already has hours logged opens a different,
          fully read-only card: total hours worked that day, each worker with their hours and
          clock-in time, and a <strong>Go to labor log</strong> link.
          <ImgPlaceholder label="Read-only labor detail card showing hours, workers, and clock-in times" size="sm" />
          <Callout type="info">
            Nothing on this card is editable. Logged labor is historical fact, so a correction
            (wrong hours, wrong worker, etc.) has to happen on the project&apos;s own{" "}
            <A href="/erp/help/workers/labor-logs">Labor log</A>, not from the calendar.
          </Callout>
        </Step>

        <Step n={7} title="Drag-and-drop rescheduling">
          Amber and dashed (planned) chips can be dragged to a different day on the month
          calendar to reschedule them, the same way you&apos;d drag an event in Google Calendar.
          Dropping on a new day moves the project&apos;s start date (for an amber chip) or the
          planned assignment and its workers (for a dashed chip).
          <ImgPlaceholder label="Dragging a chip from one day cell to another" size="sm" />
          <Callout type="warning">
            Solid (confirmed, logged-labor) chips can&apos;t be dragged. That&apos;s a historical
            record, not a plan, so it&apos;s never draggable.
          </Callout>
          <Callout type="info">
            Whenever a project&apos;s date actually changes, whether by dragging or through the
            event card&apos;s Save dates / Save planned date, the project&apos;s supervisor and PM
            get emailed about the new date, the same way they&apos;re notified when first
            assigned.
          </Callout>
        </Step>

        <Step n={8} title="Assigning ahead of time with the &quot;+&quot; button">
          For anything the event card doesn&apos;t cover (a brand-new assignment, a multi-day
          range, or a repeating weekly schedule), click the <strong>+</strong> button in the
          top-right corner of any today-or-future day cell.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_6.png" alt="Plus button on a day cell" size="sm" />
          Search for a project, pick a supervisor, and optionally set a time range (leave blank for
          an all-day event) or a repeating range. Click <strong>Assign supervisor</strong>.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_7.png" alt="Assign supervisor form" />
          <Callout type="info">
            This also sets that supervisor as the project&apos;s overall supervisor on its details
            page, and sends them a calendar invite (.ics file) by email so it shows up on their
            Google/Outlook/Apple calendar automatically. Reassigning the same project/day updates
            the same invite instead of sending a duplicate.
          </Callout>
          The same panel&apos;s <strong>Workers scheduled</strong> section lets you add workers to
          that project/day, and warns you the same way the event card does if a worker&apos;s
          already booked elsewhere that day.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_8.png" alt="Workers scheduled section with search" />
          <Callout type="warning">
            Worker assignments are for planning only. Unlike the supervisor assignment, no email
            or calendar invite is sent to workers (yet).
          </Callout>
        </Step>

        <Step n={9} title="Removing an assignment">
          Both supervisor and worker assignments can be removed with the small{" "}
          <strong>×</strong> button next to their name, either from inside the day panel or
          directly on a dashed chip&apos;s calendar entry. Removing a supervisor assignment also
          sends a cancellation to their calendar invite.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_9.png" alt="Removing an assignment with the x button" size="sm" />
        </Step>

        <Step n={10} title="What supervisors and PMs see">
          Supervisors only see projects on their calendar that they&apos;re assigned to (at the
          project level or for a specific day) or have personally logged labor on, not the whole
          company&apos;s schedule. Everyone else (Admin, PM, Finance, Estimation) sees the full
          calendar.
          <P>
            This scoping carries over to the ERP dashboard too: a supervisor&apos;s dashboard has
            a <strong>Missing Logs</strong> stat covering only their own projects, while PM and
            Admin dashboards show a company-wide <strong>Needs labor logged</strong> list of every
            project with a day that&apos;s passed and never got a labor entry. It&apos;s pinned
            near the top for PMs, and near the bottom for Admin.
          </P>
        </Step>

        <Step n={11} title="The Gantt chart">
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
