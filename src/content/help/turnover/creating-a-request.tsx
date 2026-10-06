import { Callout, H2, P, UL, LI, Steps, Step, A, Img } from "@/app/erp/components/help/HelpComponents";

export function CreatingATurnoverRequest() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Turnover requests track a unit&apos;s scope of work and drive its pricing. Clients send
        them through the website form or their private property manager page, and PMs can also
        create one directly from New Project. The same scope can be edited from inside the ERP
        afterward.
      </P>

      <Steps>
        <Step n={1} title="How most requests come in">
          Property managers send requests through the website form (sueep.com/turnover-requests)
          or their own private page. They fill in the unit, the work, and a start date.
          <Img src="/help/turnover/turnover_1.png" alt="Material Log" />
          Nothing is created right away. Each request waits on{" "}
          <strong>Property Managers → Requests</strong> until someone confirms it, and confirming
          makes the project, linked to the building and unit. See{" "}
          <A href="/erp/help/turnover/property-manager-links">Property Manager Links</A> for how to
          confirm, decline, and handle cancels.
        </Step>

        <Step n={2} title="Creating a request yourself, from New Project">
          PMs, Admins, and Sales can also create a turnover request directly, without going
          through the public form. Go to <strong>New Project</strong>, and set Segment to{" "}
          <strong>Janitorial turnover requests</strong>.
          <Img src="/help/turnover/turnover_3.png" alt="Material Log" />
          <UL>
            <LI>
              Pick the building from the dropdown, or choose <strong>Add new building...</strong>{" "}
              to create one on the spot (name, address, and PM contact).
            </LI>
            <LI>
              Add one or more units. Each one needs its own scope of work (bedrooms, bathrooms,
              square footage, condition, full clean/paint, touch-up paint, carpet cleaning, ceiling
              paint, etc.) and a <strong>start date</strong>, which is required for every unit
              before you can submit.
            </LI>
          </UL>
          <Callout type="info">
            You never type a price here. Every unit is priced automatically from the building&apos;s
            pricing package based on the scope you checked off.
          </Callout>
          Submitting creates one project per unit, each linked to its own turnover request.
        </Step>

        <Step n={3} title="Editing scope from inside the ERP">
          For a project already tied to a turnover request, open the project and go to its{" "}
          <strong>Layout</strong> tab. This is where you edit the unit&apos;s scope, bedrooms,
          bathrooms, square footage, and which services are included (full clean, full paint,
          touch-up paint, carpet cleaning, ceiling paint, and so on).
          <Img src="/help/turnover/turnover_2.png" alt="Material Log" />
          Click <strong>Save</strong> when you&apos;re done. The price updates automatically based
          on the building&apos;s pricing package and the scope you&apos;ve selected.
          <Callout type="info">
            See <A href="/erp/help/projects/projects-overview">Projects Overview</A> for the rest
            of that project&apos;s tabs.
          </Callout>
        </Step>

        <Step n={4} title="Scheduling the work">
          Once a request has a project, schedule it and assign a supervisor and crew from the
          Schedule calendar, the same way as any other project. See{" "}
          <A href="/erp/help/schedule/calendar-overview">Using the Schedule Calendar</A>.
        </Step>

        <Step n={5} title="Quality checking a unit">
          Turnover units don&apos;t use the standalone Quality Checks page or its own tab (every
          other project type gets a &quot;Quality Checks&quot; tab, turnover units don&apos;t). For
          a turnover unit, the quality check <strong>is</strong> its <strong>Checklist</strong> tab,
          right on the unit&apos;s own project page.
          <Img src="/help/turnover/turnover_4.png" alt="Material Log" />
          That tab has, in order:
          <UL>
            <LI>
              <strong>Property Information</strong>: property name, unit number, date, technician
              name(s), start/end time, a 1-10 condition score, and any issues found.
            </LI>
            <LI>
              <strong>Checklist sections</strong>: the full room-by-room checklist, each item
              checkable, with before/after photo uploads per section. A search box at the top jumps
              straight to a specific item across all sections.
            </LI>
            <LI>
              <strong>Additional Services Needed</strong>: quick checkboxes for extra work found
              during the check (paint touch-up, full repaint, carpet cleaning, maintenance repair,
              trash out).
            </LI>
            <LI>
              <strong>Signatures</strong>: technician signature and supervisor approval, drawn
              directly in the browser.
            </LI>
          </UL>
          <Callout type="warning">
            This checklist gates two different things at two different thresholds, on the unit&apos;s{" "}
            <strong>Labor</strong> tab: logging any labor at all needs the checklist at least 75%
            complete, and checking <strong>Mark unit as completed</strong> needs it{" "}
            <strong>fully</strong> checked off. A PM can override either one.
          </Callout>
        </Step>
      </Steps>
    </>
  );
}
