import { Callout, H2, P, UL, LI, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function InputtingLaborLogs() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Labor logs track time worked on any project or change order. For each entry you record the
        date, employee, clock in/out times, role, hourly rate, and task. Once saved, entries appear
        in a table where you can filter by date or search by employee name, edit or delete them,
        and (on change orders) rate the quality of the work. You can also get a quick summary of
        recent entries directly from the main projects table without opening the project.
      </P>

      <Steps>
        <Step n={1} title="Where labor logs live">
          There are two places you can add labor entries.
          <UL>
            <LI>
              <A href="/erp/help/projects/creating-a-change-order">Change orders</A>, on their own{" "}
              <strong>Laborers</strong> tab.
            </LI>
            <LI>
              <A href="/erp/help/projects/projects-overview">Projects</A>, on their own{" "}
              <strong>Labor</strong> tab.
            </LI>
          </UL>
          The two work almost the same way, with one difference noted in Step 3.
        </Step>

        <Step n={2} title="Adding a labor entry">
          On the Labor (or Laborers) tab, click the <strong>+</strong> button to open the entry
          form.
          <Img src="/help/labor_logs/labor_table.png" alt="Recent labor entries shown from the projects table" />
          <Img src="/help/labor_logs/labor_form.png" alt="Recent labor entries shown from the projects table" />
          <Callout type="info">
            The employee you pick has to already exist as an Employee in the system. Their role
            and hourly rate auto-fill from their profile, but you can still edit them for this one
            entry if it&apos;s different from usual.
          </Callout>
          Fill in the date, employee, and <strong>clock in / clock out</strong> times. Hours are
          calculated for you from those times, rather than typed in directly.
          <UL>
            <LI>
              <strong>Transportation</strong> (how they got to the job) is required. You
              can&apos;t save an entry without picking one.
            </LI>
            <LI>
              <strong>Commute minutes</strong> is optional, for the portion of the time spent
              commuting rather than on-site.
            </LI>
            <LI>
              If the project has a Schedule of Values, you can link the entry to a specific SOV
              item instead of typing a free-text task, and mark that item complete at the same
              time.
            </LI>
          </UL>
          <Callout type="warning">
            A few things can block saving an entry depending on the project: an unfinished quality
            checklist, a missing daily safety check, or (for turnover units) a warning that logging
            this entry would push the job over its hours budget. Each shows its own message
            explaining what to fix.
          </Callout>
        </Step>

        <Step n={3} title="Quality rating (change orders only)">
          When logging labor on a <strong>change order</strong>, each entry also gets a quality
          rating of excellent, good, fair, or poor. Regular project labor entries don&apos;t have
          this rating, they only have a free-text notes field instead.
        </Step>

        <Step n={4} title="Viewing and editing your entries">
          Saved entries show up in a table below the entry form.
          In this table you can filter by date or search for an employee by name. Click{" "}
          <strong>Edit</strong> on a row to change any of its fields, or <strong>Delete</strong> to
          remove it entirely.
          <br />
          <br />
          You can also take notes on quality directly on a project entry (there&apos;s no
          excellent/good/fair/poor dropdown here, just a notes field), or use the quality dropdown
          described in Step 3 for change order entries.
          <br />
          <br />
          You can quickly view a project&apos;s most recent labor entries from the main projects
          table too, by expanding a project or change order&apos;s row, without opening the full
          project.
          <Img src="/help/labor_logs/labor_3.png" alt="Recent labor entries shown from the projects table" />
        </Step>
      </Steps>
    </>
  );
}
