import { Callout, H2, P, UL, LI, Steps, Step, Img, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

export function ProjectsOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        This is an overview of the Projects section of the ERP. It covers the projects table, its
        filters, and the project details page, tab by tab.
      </P>
      <Steps>
        <Step n={1} title="Projects table">
          The first thing under Projects is the table listing every project.
          <Img src="/help/projects_overview/projects_overview_1.png" alt="Projects table" />
          At the top there are 5 tabs that filter the table by segment: All, Post-Const,
          Janitorial, Real Estate, and Manual.
          <Img src="/help/projects_overview/projects_overview_2.png" alt="Segment filter tabs" />
          On the top right there&apos;s a search bar where you can search projects by name.
          <Img src="/help/projects_overview/projects_overview_3.png" alt="Project search bar" />
          There&apos;s also a status filter for a project&apos;s stage: Upcoming, WIP, Billing, or
          Completed. A project&apos;s row is colored to match its current stage.
          <Img src="/help/projects_overview/projects_overview_4.png" alt="Status filter" />
          Clicking a project&apos;s row expands it to show its recent labor logs. See{" "}
          <A href="/erp/help/workers/labor-logs">Inputting Labor Logs</A> for more. A project&apos;s
          change orders expand the same way, showing their own labor logs.
          <Img src="/help/projects_overview/projects_overview_5.png" alt="Expanded project row" />
        </Step>

        <Step n={2} title="Overview tab">
          Clicking a project&apos;s title opens its details page, landing on the{" "}
          <strong>Overview</strong> tab.
          <ImgPlaceholder label="Overview tab: work order fields plus lifecycle/segment/PM/dates setup" />
          This tab combines what used to be two separate tabs. It has the project&apos;s work
          order fields (name, address, service type, main points of contact, and any notes to the
          PM), plus its setup fields: lifecycle (Upcoming, WIP, or Completed), segment, PM,
          supervisor, and start/end dates.
          <Callout type="warning">Remember to save after editing, either section.</Callout>
          You can also send the work order to employees in the system from here, to notify them of
          the project and link them to its page. If someone doesn&apos;t have an ERP login, they
          can only view the email, not the linked page.
        </Step>

        <Step n={3} title="Layout tab (turnover units only)">
          Projects tied to a janitorial turnover request get an extra <strong>Layout</strong> tab,
          for editing the unit&apos;s scope of work, bedrooms, bathrooms, square footage, and which
          services are included (clean, paint, carpet cleaning, and so on). This scope is what
          drives the unit&apos;s price against the building&apos;s pricing package. Click{" "}
          <strong>Save</strong> when you&apos;re done.
          <ImgPlaceholder label="Layout tab showing unit scope of work fields" size="sm" />
          See <A href="/erp/help/turnover/creating-a-request">Creating a Turnover Request</A> for
          more on how this scope feeds into pricing.
        </Step>

        <Step n={4} title="Financials tab">
          Next is the <strong>Financials</strong> tab, where you can edit contract value, percent
          done, percent invoiced, and billing status, plus estimated and actual costs. Actual labor
          and material costs are calculated from the project&apos;s own logs rather than typed in
          by hand.
          <ImgPlaceholder label="Financials tab with contract value, costs, and Schedule of Values" />
          Below that is the project&apos;s <strong>Schedule of Values</strong>, a line-item
          breakdown used to track what&apos;s been billed against the contract.
        </Step>

        <Step n={5} title="Labor, Contractors, and Materials tabs">
          <UL>
            <LI>
              <strong>Labor:</strong> log labor entries, and view/sort existing ones. See{" "}
              <A href="/erp/help/workers/labor-logs">Inputting Labor Logs</A> for the full
              workflow, including the safety-check and quality-checklist rules that can block an
              entry from being saved.
            </LI>
            <LI>
              <strong>Contractors:</strong> log contractors registered in the system, following a
              similar process to laborers. See{" "}
              <A href="/erp/help/workers/logging-contractors">Assigning Contractors to
              Projects</A>.
            </LI>
            <LI>
              <strong>Materials:</strong> log materials bought for the project. See{" "}
              <A href="/erp/help/projects/material-logs">Logging Materials</A>.
            </LI>
          </UL>
        </Step>

        <Step n={6} title="Checklist tab">
          For janitorial turnover units, this tab is the unit&apos;s full quality checklist,
          tracking what&apos;s been completed before the unit can be marked done. Other project
          types get a simpler generic checklist.
          <ImgPlaceholder label="Turnover unit quality checklist" size="sm" />
        </Step>

        <Step n={7} title="Other tabs you may see">
          Depending on the project&apos;s segment, a few more tabs can show up:
          <UL>
            <LI>
              <strong>Pricing Package</strong> (turnover and real estate): the pricing terms tied
              to the building or unit.
            </LI>
            <LI>
              <strong>Safety Checklist</strong> (post-construction): daily safety check history for
              the project.
            </LI>
            <LI>
              <strong>Signing</strong>: upload and send the project&apos;s contract for
              e-signature. See <A href="/erp/help/contracts/uploading-a-contract">Uploading a
              Contract</A>.
            </LI>
            <LI>
              <strong>Quality Checks</strong>: quality checks logged against this project, with
              photo evidence and a supervisor signature.
            </LI>
          </UL>
        </Step>

        <Step n={8} title="Change Orders tab">
          Finally, the <strong>Change Orders</strong> tab lists change orders on the project. See{" "}
          <A href="/erp/help/projects/creating-a-change-order">Creating a Change Order</A> for how
          to create and manage them.
        </Step>
      </Steps>
    </>
  );
}
