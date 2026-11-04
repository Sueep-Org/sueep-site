import { H2, P, UL, LI, Steps, Step, A } from "@/app/erp/components/help/HelpComponents";

export function JanitorialQualityChecks() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        A janitorial quality check is a site visit by a project manager or admin: check the building&apos;s key areas
        (bathrooms, lobby, hallways...), talk with the property manager, and pass updates to the cleaning team. They are
        scheduled and filled in on a contract&apos;s <strong>Quality</strong> tab. For quality checks on project and turnover
        work, see <A href="/erp/help/projects/quality-checks">Project Quality Checks</A>.
      </P>

      <H2>Setting up the key areas</H2>
      <P>
        On the Quality tab, set the building&apos;s <strong>Key areas</strong> once. It starts from the contract&apos;s
        service areas. Every visit checks them in that order.
      </P>

      <H2>Scheduling a check</H2>
      <UL>
        <LI>
          Click <strong>Schedule a check</strong>, pick the date and who is doing it.
        </LI>
        <LI>The person gets an email when someone else assigns them, and again the morning before.</LI>
        <LI>
          Checks show on the Management calendar under <strong>Quality checks</strong>, and the Contracts list shows each
          building&apos;s <strong>Next check</strong>.
        </LI>
        <LI>
          <strong>Edit</strong> moves it or gives it to someone else; <strong>Cancel</strong> removes it.
        </LI>
      </UL>

      <H2>Doing the check</H2>
      <Steps>
        <Step n={1} title="Start">
          At the building, click <strong>Start check</strong> on your phone (or the button in the email).
        </Step>
        <Step n={2} title="Go through the areas">
          Mark each area <strong>Good</strong> or <strong>Needs attention</strong>, with photos and notes. If an area needed
          attention last visit, that note shows under it so you can check it was fixed. Add an area for just this visit at the
          bottom.
        </Step>
        <Step n={3} title="Fill in the visit">
          Who you spoke with at the property, what was discussed, and any updates for the team.{" "}
          <strong>Save draft</strong> keeps your answers.
        </Step>
        <Step n={4} title="Finish check">
          Marks it done and opens <strong>Send visit summary</strong>.
        </Step>
      </Steps>

      <H2>The visit summary</H2>
      <P>
        Pick who gets it (property managers with a link to the building, the building contact, or any email), edit the
        message, and choose whether to include area notes, what you discussed and photos. Each area&apos;s Good or Needs
        attention is always included. Check the preview, then send, or skip and send it later from the check.
      </P>

      <H2>What the team sees</H2>
      <P>
        When areas need attention or there are team updates, the janitors scheduled at the building get an email (if their
        profile has one) and see the notes on their clock-in page, in English or Spanish, until they tap{" "}
        <strong>I&apos;ve seen this</strong>, or for 14 days.
      </P>

      <H2>Overdue and past checks</H2>
      <P>
        A check not finished by its date shows as <strong>Overdue</strong>, and the next morning the person and every admin
        get one email about it. Finished checks list how many areas needed attention; click one to see everything from that
        visit.
      </P>
    </>
  );
}
