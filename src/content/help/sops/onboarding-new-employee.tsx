import { Callout, Steps, Step, H2, P } from "@/app/erp/components/help/HelpComponents";

export function OnboardingNewEmployee() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        This SOP covers the steps to onboard a new employee from candidate to active employee record in the ERP.
      </P>

      <Callout type="info">
        Fill this in with your standard onboarding steps.
      </Callout>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Create a candidate record">
          Add the person as a candidate under the <strong>Candidates</strong> section. Attach any
          relevant contracts or offer letters.
        </Step>
        <Step n={2} title="Send contracts for signing">
          Upload the employment contract PDF and send for signing via DocuSeal.
        </Step>
        <Step n={3} title="Promote to employee">
          Once contracts are signed, create an employee record and link it to the candidate.
        </Step>
        <Step n={4} title="Assign to projects">
          Add the employee to any relevant labor assignments or project teams.
        </Step>
      </Steps>
    </>
  );
}
