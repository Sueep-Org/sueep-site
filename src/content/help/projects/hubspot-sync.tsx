import { Callout, H2, H3, P, UL, LI } from "@/app/erp/components/help/HelpComponents";

export function HubSpotSync() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The ERP automatically pulls deals from HubSpot at regular intervals and creates or updates
        corresponding projects. You can also trigger a manual sync from the HubSpot panel.
      </P>

      <H2>What gets synced</H2>
      <P>When a deal is <strong>created</strong> in HubSpot, the ERP creates a new project with:</P>
      <UL>
        <LI>Job title (from deal name)</LI>
        <LI>Segment (from pipeline)</LI>
        <LI>Status (from deal stage)</LI>
        <LI>Start and end dates</LI>
        <LI>Contract value</LI>
      </UL>

      <P>When a deal <strong>updates</strong> in HubSpot, the ERP overwrites:</P>
      <UL>
        <LI>Segment, status, and dates</LI>
      </UL>

      <Callout type="warning">
        The <strong>job title is not overwritten</strong> on updates — if you rename a project in the ERP,
        that name is kept. All other synced fields will be overwritten on each sync.
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
