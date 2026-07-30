import { Callout, H2, P, UL, LI, Steps, Step, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

export function CreatingATurnoverRequest() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Turnover requests track a unit&apos;s scope of work and drive its pricing. Most come in
        through the public request form, but the same scope can also be edited from inside the
        ERP.
      </P>

      <Steps>
        <Step n={1} title="How most requests come in">
          Property managers, project managers, and real estate contacts submit requests through
          the public form on the marketing site, not from inside the ERP. That form has them fill
          in the unit and scope of work, and sign before submitting.
          <ImgPlaceholder label="Public turnover request form" />
          Once submitted, the request creates a project in the ERP automatically, linked to the
          building and unit.
        </Step>

        <Step n={2} title="Editing scope from inside the ERP">
          For a project already tied to a turnover request, open the project and go to its{" "}
          <strong>Layout</strong> tab. This is where you edit the unit&apos;s scope, bedrooms,
          bathrooms, square footage, and which services are included (full clean, full paint,
          touch-up paint, carpet cleaning, ceiling paint, and so on).
          <ImgPlaceholder label="Layout tab with unit scope fields and Save button" size="sm" />
          Click <strong>Save</strong> when you&apos;re done. The price updates automatically based
          on the building&apos;s pricing package and the scope you&apos;ve selected.
          <Callout type="info">
            See <A href="/erp/help/projects/projects-overview">Projects Overview</A> for the rest
            of that project&apos;s tabs.
          </Callout>
        </Step>

        <Step n={3} title="Scheduling the work">
          Once a request has a project, schedule it and assign a supervisor and crew from the
          Schedule calendar, the same way as any other project. See{" "}
          <A href="/erp/help/schedule/calendar-overview">Using the Schedule Calendar</A>.
        </Step>

        <Step n={4} title="Quality checks">
          Quality checks are their own page (<strong>Quality Checks</strong> in the ERP nav), not a
          status field on the request itself. Click <strong>+ New quality check</strong>, pick the
          project or turnover request it&apos;s for, and fill in:
          <ImgPlaceholder label="New quality check form with supervisor signature and evidence photos" size="sm" />
          <UL>
            <LI>Supervisor name</LI>
            <LI>A PM approval checkbox</LI>
            <LI>A supervisor signature, drawn directly in the form</LI>
            <LI>Evidence photos, required before it can be submitted</LI>
          </UL>
          Submitted checks show up in the Quality Checks list for review.
        </Step>
      </Steps>
    </>
  );
}
