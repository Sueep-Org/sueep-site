import { Callout, H2, P, UL, LI, Steps, Step, A, Img } from "@/app/erp/components/help/HelpComponents";

export function OnboardingNewEmployee() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        This covers onboarding a person from job applicant to active Employee record in the ERP,
        using the <strong>Candidates</strong> section.
      </P>

      <Steps>
        <Step n={1} title="Where candidates come from">
          Candidates aren&apos;t added manually. They come in through the public Careers
          application form on the website, and show up automatically in the Candidates list.
          <Callout type="info">
            There&apos;s no &quot;Add candidate&quot; button. If someone applied outside that form,
            they&apos;ll need to submit the application before they&apos;ll show up here.
          </Callout>
        </Step>

        <Step n={2} title="Pipeline tab">
          Open a candidate&apos;s record and use the <strong>Pipeline</strong> tab to move them
          through their status: Applied, Interviewing, Onboarding, or Denied.
          <Img src="/help/employees/pipeline.png" alt="Employees details" />
          <Callout type="tip">
            Setting status to <strong>Onboarding</strong> automatically fills in a default
            paperwork checklist (Driver&apos;s License, Social Security Card, Passport or ID, W-4,
            I-9) and turns on a bank account requirement. You can still add or remove items from
            that list afterward.
          </Callout>
          Internal notes on this tab are for your own team, not visible to the candidate.
        </Step>

        <Step n={3} title="Paperwork tab">
          Once a candidate is Onboarding, use the <strong>Paperwork</strong> tab to send them a
          secure upload link by email. No ERP login is required on their end, and the link expires
          after 7 days.
          <Img src="/help/employees/paperwork.png" alt="Employees details" />
          The tab shows which required documents are still pending, and updates once the candidate
          uploads each one. Click <strong>Resend upload link</strong> if it expires before
          they&apos;re done.
        </Step>

        <Step n={4} title="Onboarding tab: creating the employee record">
          Once every document is in, go to the <strong>Onboarding</strong> tab and click{" "}
          <strong>Finish onboarding &rarr; Add as employee</strong>.
          <Img src="/help/employees/onboarding.png" alt="Employees details" />
          This creates a new Employee record, copying over their name, email, phone, role, and
          bank info, and moves their uploaded documents onto that new Employee profile. Their
          candidate status flips to Hired.
          <Callout type="warning">
            If an employee profile already exists for that email, you&apos;ll get a link to the
            existing profile instead of a duplicate being created.
          </Callout>
        </Step>

        <Step n={5} title="Submission tab">
          This tab is a read-only view of what the candidate originally submitted on their
          application: contact info, position interest, whether they have a vehicle, cleaning
          experience, and any comments they left.
        </Step>

        <Step n={6} title="Signing tab">
          Send the employment contract for e-signature the same way you would anywhere else in the
          ERP. See <A href="/erp/help/contracts/uploading-a-contract">Uploading a Contract</A> for
          the full DocuSeal workflow.
        </Step>

        <Step n={7} title="After they become an employee">
          Once promoted, the person has their own Employee profile, with its own required-document
          compliance tracker and background check status, separate from the candidate paperwork
          checklist above. See{" "}
          <A href="/erp/help/workers/adding-employees">Adding and Managing Employees</A> for that
          profile&apos;s tabs and fields.
          <UL>
            <LI>Compliance only tracks required documents on file, not the background check.</LI>
            <LI>Background check status is tracked separately as Not done, Pending, Passed, or Failed.</LI>
          </UL>
        </Step>
      </Steps>
    </>
  );
}
