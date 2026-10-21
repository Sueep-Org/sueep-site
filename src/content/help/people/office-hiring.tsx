import { Callout, H2, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function OfficeHiring() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        <strong>Candidates</strong> has two tabs. <strong>Field</strong> is cleaners, painters and supervisors, same as
        before. <strong>Office</strong> tracks office job openings (like a Marketing Manager), the people who applied,
        and what the job ads cost. Only Admins, PMs and the Business Manager see the Office tab.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Openings">
          The Office tab shows one card per opening with its status (Open, Paused, Filled, Closed) and how many
          candidates are at each stage. Filled and closed openings are hidden until you click{" "}
          <strong>Show filled and closed</strong>. The search box finds a candidate across every opening.
          <P>
            Click <strong>+ New opening</strong> to add one: job title, department, location, work mode (on site,
            hybrid, remote), salary range, hiring manager and notes. Salaries can be typed as 65000 or 65k.
          </P>
        </Step>

        <Step n={2} title="Job ads">
          Open an opening to see its <strong>job ads</strong>. Click <strong>+ Add ad</strong> for each place it was
          posted (LinkedIn, Indeed, referral, website, other) with the date, cost and how many applied. The bottom row
          totals the cost and applicants.
          <Callout type="info">
            Ad costs also show on the Finance dashboard as <strong>Hiring ads</strong>, in the month the ad was posted.
          </Callout>
        </Step>

        <Step n={3} title="Candidates">
          Below the ads is a board with one column per stage. Filter by stage or source, or search by name, phone or
          email. Click <strong>+ Add candidate</strong> to add someone by hand. Rejected and withdrawn candidates sit in
          one collapsed column until you show them.
          <UL>
            <LI>
              <strong>Stages:</strong> New, Contacting, Phone screen, Interview, Final round, Offer, Backup, Hired,
              Rejected, Withdrew. Drag a card to another column, or use its <strong>⋯</strong> menu (Move to) on a phone.
            </LI>
            <LI>
              <strong>Star</strong> someone to shortlist them.
            </LI>
            <LI>
              Click a name to open their page, with contact info, expected salary, source and a notes box for call
              notes and interview impressions.
            </LI>
          </UL>
        </Step>

        <Step n={4} title="Hiring someone">
          Set the stage to <strong>Hired</strong>. That opens the Paperwork, Onboarding and Signing tabs on their page,
          the same as a field hire, so you can finish onboarding them as an employee.
          <Callout type="tip">
            Office candidates are never deleted automatically. Field candidates who were denied still are, after a while.
          </Callout>
        </Step>
      </Steps>
    </>
  );
}
