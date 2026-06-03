import { Callout, Steps, Step, H2, P } from "@/app/erp/components/help/HelpComponents";

export function CreatingATurnoverRequest() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Turnover requests are created per building and unit. They track the scope of work, assigned
        labor, pricing, and approval status.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Go to the building">
          Navigate to the building the request is for.
        </Step>
        <Step n={2} title="Create the request">
          Click <strong>New Request</strong> and fill in the unit number, request type (Turnover or
          Regular), and scope of work.
        </Step>
        <Step n={3} title="Assign labor">
          Add labor assignments with the relevant employees, roles, and dates.
        </Step>
        <Step n={4} title="Submit for quality check">
          Once work is complete, move the status to <strong>Quality Check</strong> so a supervisor
          can review and approve.
        </Step>
      </Steps>

      <Callout type="info">
        The <strong>Approved</strong> status should only be set after the PM has signed off on the quality check.
      </Callout>
    </>
  );
}
