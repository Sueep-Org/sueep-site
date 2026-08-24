import { Callout, H2, P, UL, LI, Steps, Step, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

export function BuildingsOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        A building is the property a janitorial turnover client owns, everything about turnover
        pricing, units, and recurring monthly contracts is scoped to one. Buildings don&apos;t have
        their own item in the left nav, get to the list by going directly to{" "}
        <strong>ERP → Buildings</strong> in the address bar, or by clicking a building&apos;s name
        from the <A href="/erp/help/billing/billing-overview">Billing → Recurring</A> tab.
      </P>
      <ImgPlaceholder label="Buildings list page" />

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Adding a building">
          Click <strong>Add building</strong> on the list page. Only name and address are
          required, builder and the property manager&apos;s name, email, and phone are optional
          and can be filled in later.
          <ImgPlaceholder label="Add building form" />
        </Step>

        <Step n={2} title="Details tab">
          A building&apos;s own page opens on the <strong>Details</strong> tab: its profile fields,
          plus a HubSpot deal search so turnover invoices can be matched to that deal, and (for
          roles that can edit pricing) who earns commission on this building&apos;s turnover work.
          Below that is a shared <strong>Notes</strong> section the whole team can post to.
          <ImgPlaceholder label="Building Details tab" />
          <Callout type="info">
            Supervisors and employees see a read-only summary here instead of the editable form.
          </Callout>
        </Step>

        <Step n={3} title="Units tab">
          Lists every turnover unit tied to this building, each one linking to its own project
          page. Click <strong>+ Add unit</strong> to create a new one directly: unit identifier,
          whether it&apos;s a common area or a partial turn, bedrooms/bathrooms, square footage,
          condition, a required start date, and the scope of work (full clean, full paint,
          touch-up paint, carpet cleaning, additional materials, ceiling paint, compounding, or
          other work).
          <ImgPlaceholder label="Units tab with Add unit form" />
          <Callout type="warning">
            If the unit identifier you type matches one that already exists on this building
            (including units enrolled on an active recurring contract), you&apos;ll be warned
            before it lets you continue anyway.
          </Callout>
          <Callout type="info">
            No price is entered here either, same as creating a turnover request anywhere else,
            it&apos;s computed automatically from the building&apos;s pricing package. See{" "}
            <A href="/erp/help/turnover/creating-a-request">Creating a Turnover Request</A>.
          </Callout>
        </Step>

        <Step n={4} title="Log Hours tab">
          Only shown to roles that can add labor logs. Lets you log one crew&apos;s hours once and
          split each worker&apos;s time evenly across every unit they worked that day, rather than
          logging the same worker separately on each unit&apos;s own Labor tab. Pick the date,
          transportation method, which units were worked, and add each worker with their total
          hours and rate, the form shows the per-unit split as you type. This creates a real labor
          entry on each selected unit.
          <ImgPlaceholder label="Log Hours tab with worker split preview" />
        </Step>

        <Step n={5} title="Pricing Package tab">
          The rate card this building&apos;s turnover units are priced from: a dollar rate per
          layout (studio, 1/1, 2/1, 2/2, 3/1, 3/2, 3/3) for cleaning, painting, touch-up paint,
          carpet cleaning, additional materials, ceiling paint, and compounding, plus any custom
          line items specific to this building (e.g. a den surcharge). Editing requires a role that
          can edit pricing.
          <ImgPlaceholder label="Pricing Package tab" />
        </Step>

        <Step n={6} title="Recurring Contract tab">
          For buildings on a flat monthly janitorial contract instead of one-off turnover pricing.
          <ImgPlaceholder label="Recurring Contract tab" />
          <UL>
            <LI>
              If none exists yet, set one up here: monthly rate, billing day of month, start date,
              and which salesperson earns commission on it.
            </LI>
            <LI>
              Once created, enroll the units it covers (unit number, bed/bath, common area, and
              which services are included), and pause, resume, or end the contract entirely.
            </LI>
            <LI>
              Below that is a read-only <strong>Period history</strong> table, one row generated
              per billing month, with that period&apos;s revenue, cost, and margin. See{" "}
              <A href="/erp/help/billing/billing-overview">Billing Overview</A> for where these
              periods get marked billed and paid.
            </LI>
          </UL>
        </Step>
      </Steps>
    </>
  );
}
