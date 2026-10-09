import { Callout, H2, P, UL, LI, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function ScheduleCalendarOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The Schedule page (<strong>ERP → Schedule</strong>) has a month{" "}
        <strong>Calendar</strong> (the <strong>Projects</strong> tab) with a{" "}
        <strong>Gantt</strong> chart below it. The calendar shows what&apos;s actually happening
        day-by-day, driven by real logged labor rather than just a project&apos;s start and end
        dates, plus anything planned ahead of time. The Gantt shows projects as bars over time,
        or each worker&apos;s jobs over time.
      </P>
      <P>
        Tabs at the top switch between calendars. <strong>Master</strong> puts projects,
        janitorial shifts and (for Admins and PMs) management items on one month view; click a
        chip to open it, and use the Projects / Janitorial / Management buttons to hide a layer.{" "}
        <strong>Projects</strong> is everything described below. <strong>Janitorial Contracts</strong> shows recurring janitorial shifts,
        see{" "}
        <A href="/erp/help/janitorial/janitorial-contracts">Janitorial Contracts</A>. Admins and PMs
        also see <strong>Management</strong>, for insurance expirations, time off and company
        deadlines, see <A href="/erp/help/schedule/management-calendar">Management Calendar</A>.
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
            Some subs run jobs on their own. On the sub&apos;s page (Contractors, then the sub,
            then General information), check <strong>Runs jobs without a supervisor</strong>. Any
            job or day that sub is planned on then skips the amber &quot;needs a supervisor&quot;
            warnings here, on the dashboard, and in the daily schedule reminder emails.
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
          <Img src="/help/schedule_calendar_overview/calendar_card.png" alt="Filter panel with supervisor and project type options" size="sm" />
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
          <Img src="/help/schedule_calendar_overview/calendar_card.png" alt="Filter panel with supervisor and project type options" size="sm" />
          Changing the planned date and clicking <strong>Save planned date</strong> moves just that
          day&apos;s assignment (and any workers already scheduled on it) to the new day. It does{" "}
          <strong>not</strong> change the project&apos;s overall Start/End date.
        </Step>

        <Step n={6} title="Confirmed chips: the read-only labor card">
          Clicking a <strong>solid</strong> chip that already has hours logged opens a different,
          fully read-only card: total hours worked that day, each worker with their hours and
          clock-in time, and a <strong>Go to labor log</strong> link.
          <Img src="/help/schedule_calendar_overview/solid_card.png" alt="Filter panel with supervisor and project type options" size="sm" />
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
          The <strong>Gantt</strong> sits below the Projects calendar and has three views. <strong>By project</strong> shows a
          horizontal timeline of commercial painting
          and cleaning projects that are <strong>Active</strong>, <strong>Upcoming</strong>, or{" "}
          <strong>On hold</strong>, grouped into sections: <strong>In progress</strong>,{" "}
          <strong>Needs attention</strong>, <strong>Upcoming</strong>, and <strong>On hold</strong>{" "}
          (collapsed to start). Click a section heading to collapse or expand it. Jobs with no
          dates at all show <strong>No dates set</strong> instead of a bar.
          <Img src="/help/schedule_calendar_overview/schedule_calendar_overview_10.png" alt="Gantt chart view" />
          <P>
            How to read a bar: the solid fill is % done. A dashed outline is upcoming, gray is on
            hold. A red line after a bar shows how many days it&apos;s past its end date. A bar with
            a faded end has no end date set, so its length is an estimate (an open job runs at
            least up to today). A striped section is the job&apos;s change orders, so the bar keeps
            going through change-order work and the job only counts as late once that&apos;s
            past too. The number after an in-progress bar is its % done; a red number is days
            late. Small circles next to each project name are who covers it (pink for the
            supervisor, blue for subs). Many jobs run on a sub alone, so no supervisor is normal.
            Hover any name, bar, circle, or icon for the full details (dates, crew, problems). A
            small color key sits above the chart, and the <strong>i</strong> icon explains more.
          </P>
          <P>
            The <strong>Needs attention</strong> section holds projects that are 100% done but
            not marked complete, past their end date, or upcoming with a start date that already
            passed. An amber check means done but not marked complete; an amber clock means the
            start date passed. The <strong>Missing dates</strong> button lists projects missing a
            start or end date.
          </P>
          <P>
            Switch between <strong>Week</strong>, <strong>Month</strong>, and{" "}
            <strong>Quarter</strong> zoom. Use the <strong>Today</strong> button and the arrows next
            to it to jump to or scroll around the current date. When a project&apos;s bar is
            scrolled out of view, a date pill shows at the edge of its row; click it to slide to
            that bar. Picking a filter jumps to its projects if none are in view. On a phone or
            small screen, swipe the chart in any direction. The names stay pinned on the left.
          </P>
          <P>
            <strong>By crew</strong> shows one row per person (supervisors, employees, and subs)
            with a block for each job they&apos;re on, from four weeks back onward, turnovers
            included. Solid blocks are logged work or a confirmed sub; dashed blocks are only
            planned. The strip under each name is the next 14 days, filled where they&apos;re booked
            and all green when they&apos;re free. A red mark on top of a row means that person is on
            two jobs the same day; use <strong>Double-booked</strong> to list only those people.
            Click any block to open its project.
          </P>
          <P>
            <strong>Turnovers</strong> shows one row per property and one cell per week. The
            number in each cell is how many turnover units at that property are on the schedule
            that week (logged, planned, or starting), and darker green means busier. Hover a cell
            to see which units. Busiest properties are listed first, the green badge is how many
            units are still open, and the top row adds up every property.
          </P>
          <P>
            Admins and PMs can change dates right on the chart in <strong>By project</strong>.
            Drag a bar to move the whole job, or drag its left or right edge to change just the
            start or end date. A date preview shows while you drag, and you confirm before
            anything saves. Changing a start date emails the supervisor and PM, the same as
            moving it on the calendar, and a job with one planned day moves that day too. Dragging
            the right edge of a job with no end date is a quick way to set one. Dragging works with
            a mouse or trackpad; on a phone, tap a bar to open the project instead.
          </P>
        </Step>
      </Steps>
    </>
  );
}
