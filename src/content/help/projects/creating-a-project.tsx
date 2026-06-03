import { Callout, Steps, Step, H2, P } from "@/app/erp/components/help/HelpComponents";

export function CreatingAProject() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Projects can be created manually or synced automatically from HubSpot deals. This guide covers manual creation.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Go to New Project">
          Click <strong>New Project</strong> in the left sidebar under Project Information.
        </Step>
        <Step n={2} title="Fill in the details">
          Enter the job title, segment, supervisor, and any relevant dates or contract value.
        </Step>
        <Step n={3} title="Save">
          Click <strong>Create Project</strong>. The project will appear on the Projects list and the Schedule immediately.
        </Step>
      </Steps>

      <Callout type="info">
        Manually created projects are labeled <strong>Manually created</strong> on the project detail page.
        Projects synced from HubSpot are labeled <strong>Synced from HubSpot</strong> and will have their
        status and dates updated automatically on each sync.
      </Callout>
    </>
  );
}
