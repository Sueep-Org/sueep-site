import { A, Callout, H2, P, UL, LI } from "@/app/erp/components/help/HelpComponents";

export function HubSpotSync() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Whenever a deal is created or changed in HubSpot, the ERP syncs its deals and creates or
        updates the matching projects. Project Managers, Business Managers and Admins can also run a
        sync by hand on the <A href="/erp/hubspot">HubSpot sync</A> page.
      </P>

      <H2>What gets synced</H2>
      <P>When a deal is <strong>created</strong> in HubSpot, the ERP creates a new project with:</P>
      <UL>
        <LI>Job title (from deal name)</LI>
        <LI>Segment (from pipeline)</LI>
        <LI>Status (from deal stage)</LI>
        <LI>Start and end dates</LI>
        <LI>Contract value</LI>
        <LI>Deal owner (name and email, shown on the project page)</LI>
        <LI>Supervisor, left unassigned until someone sets it</LI>
      </UL>

      <P>When a deal <strong>updates</strong> in HubSpot, the ERP overwrites:</P>
      <UL>
        <LI>Segment, status, and dates</LI>
        <LI>Deal owner</LI>
        <LI>Billing status, based on the deal&apos;s stage (for example, moving a deal to a billing stage sets the project to Billing)</LI>
      </UL>

      <Callout type="warning">
        The <strong>job title is not overwritten</strong> on updates, so if you rename a project in the ERP,
        that name is kept. The supervisor also isn&apos;t overwritten once someone has set it. All
        other synced fields above will be overwritten on each sync.
      </Callout>

      <Callout type="warning">
        If a deal is marked <strong>closed lost</strong> in HubSpot, its project is{" "}
        <strong>deleted</strong> from the ERP on the next sync, not just archived. If a project
        disappears unexpectedly, check whether its HubSpot deal was closed lost before assuming
        something went wrong.
      </Callout>

      <H2>What is never overwritten</H2>
      <P>These fields are always safe to edit in the ERP:</P>
      <UL>
        <LI>Job title</LI>
        <LI>Supervisor (once assigned)</LI>
        <LI>Description</LI>
        <LI>Financial estimates and actuals</LI>
        <LI>Percent done / invoiced</LI>
      </UL>

      <H2>Contacts</H2>
      <P>
        Contacts associated with a HubSpot deal are synced to the project&apos;s Contacts section. If a
        contact is removed from the deal in HubSpot, it will be removed from the project on the next sync.
      </P>

      <Callout type="info">
        Contacts you add manually in the ERP are never affected by the sync.
      </Callout>
    </>
  );
}
