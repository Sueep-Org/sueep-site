import { Callout, H2, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function InsuranceOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The Insurance &amp; COIs page (<strong>ERP → Insurance &amp; COIs</strong>) keeps track of Sueep&apos;s own insurance
        policies and the GCs and property managers who ask us for a certificate of insurance (COI). The COIs themselves are still
        made in CoverDash. This page is where we keep the details that CoverDash doesn&apos;t: when each policy expires, and what
        each holder needs on their certificate.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Our Policies tab">
          Lists each of our policies (general liability, umbrella, auto, hired and non-owned auto, workers&apos; comp) with its
          carrier, limits, and expiration date. Click <strong>+ Add policy</strong> to add one, or click a row to change it.
          Hover the <strong>i</strong> icons for what each field means.
          <UL>
            <LI>
              <strong>Expiration date</strong> is required. A badge shows <strong>Current</strong>, the number of days left once
              it&apos;s within 30 days, or <strong>Expired</strong>.
            </LI>
            <LI>
              <strong>Includes</strong>: check additional insured, waiver of subrogation, and primary and noncontributory when
              the policy page in CoverDash lists them as Included. These drive the checks on the Certificate Holders tab. For
              general liability, also check <strong>Aggregate applies per project</strong> if it does.
            </LI>
            <LI>
              <strong>On our COIs</strong>: leave checked for policies that go on the certificates we give GCs. Uncheck it for
              ones CoverDash leaves off, like our owned auto. Checked policies are pre-selected when adding a COI to a project.
            </LI>
            <LI>
              <strong>Cost</strong>: the premium for the current term, fees and taxes included. It counts as overhead on the
              dashboard&apos;s Finance tab, spread evenly over the term. When an audit bill or refund comes in, enter the amount
              (negative for a refund) and its date. If the policy was cancelled early, enter <strong>Cancelled on</strong>.
            </LI>
            <LI>
              When a policy renews, edit it and update its dates, then enter the new premium. The old term and its cost move to{" "}
              <strong>Past terms</strong> on their own, so last year&apos;s months keep their cost. An audit for an old term
              usually comes later: click <strong>Edit</strong> on that past term to add it. If it was cancelled or replaced,
              uncheck <strong>Active</strong> instead of deleting it.
            </LI>
          </UL>
          The strip at the top shows how many policies are active, which one expires next, and the most we can certify per
          occurrence (general liability plus umbrella).
        </Step>

        <Step n={2} title="Certificate Holders tab">
          One profile per GC, property manager, or anyone else who asks for our COI. Click <strong>+ Add holder</strong>, or click
          a row to edit it. Use the search box to find a holder by name, other names, or contact.
          <UL>
            <LI>
              <strong>Name</strong> is exactly how it should appear in the certificate holder box. Put
              other spellings you&apos;ve seen on past COIs in <strong>Other names</strong>, one per line, so the profile is
              found under any of them.
            </LI>
            <LI>
              <strong>Requirements</strong>: the limits and wording items from their contract or vendor requirements, plus
              names to list as additional insured and any Description of Operations wording. Leave a limit blank if they
              don&apos;t ask for it.
            </LI>
            <LI>
              These requirements also apply to subcontractors: a sub must carry what the GC requires on the job. Subs on a
              project with this holder are checked against them (see the project&apos;s Contractors tab).
            </LI>
          </UL>
          <Callout type="info">
            The ERP won&apos;t let you add a second profile with the same name, even with different punctuation or Inc/LLC. Edit the
            existing one instead.
          </Callout>
        </Step>

        <Step n={3} title="Checking requirements against our coverage">
          As you type a holder&apos;s requirements, the form compares them with our active policies:
          <UL>
            <LI>
              <strong>Gap</strong> (red): our coverage falls short, for example a limit above what we can certify, or waiver
              required on a policy that excludes it. Talk to the broker before promising the certificate.
            </LI>
            <LI>
              <strong>Note</strong> (amber): it&apos;s covered, but the umbrella has to be on the certificate.
            </LI>
          </UL>
          The <strong>Our coverage</strong> column on the list shows the same result: <strong>Covered</strong>,{" "}
          <strong>Needs umbrella</strong>, or the number of gaps. A limit is the most a policy pays:{" "}
          <strong>each occurrence</strong> per incident, <strong>aggregate</strong> in total for the policy year.
        </Step>

        <Step n={4} title="COIs on a project">
          Every project has a <strong>COIs</strong> tab listing the certificates we gave out for it. To add one:
          <UL>
            <LI>
              Click <strong>+ Add COI</strong> and pick who it&apos;s for. Their saved details (name, address, additional insured
              names, wording) show in the <strong>For CoverDash</strong> box, ready to copy into CoverDash.
            </LI>
            <LI>Make the COI in CoverDash and download the PDF.</LI>
            <LI>
              Back in the ERP, check the policies listed on the PDF, set the date on the COI, attach the PDF, and check{" "}
              <strong>Already sent</strong> if it went out.
            </LI>
          </UL>
          <strong>Good until</strong> is when the first policy on the certificate expires. It&apos;s saved with the COI, so
          renewing a policy later doesn&apos;t change it. The newest COI for each company is the current one; older ones show as{" "}
          <strong>Replaced</strong>. Click a row to mark it sent, add notes, open the PDF, or delete it.
        </Step>

        <Step n={5} title="Expiring COI warnings">
          On projects that aren&apos;t fully paid, a current COI that has expired or expires within 30 days shows up in three
          places:
          <UL>
            <LI>
              The <strong>COIs</strong> box under Needs attention on the dashboard, which also counts new COI requests.
            </LI>
            <LI>A red or amber pill under the project name.</LI>
            <LI>A pill next to the project on the Post-Construction tab of Project Billing.</LI>
          </UL>
          <Callout type="info">
            GCs often hold payment until they have a current COI. Add a new one to the project before invoicing and the warning
            clears.
          </Callout>
        </Step>

        <Step n={6} title="COI request links">
          GCs and property managers can ask for a COI through a link instead of email. The form asks who the certificate is
          for, their requirements and wording, and lets them attach a sample.
          <UL>
            <LI>
              <strong>Project link</strong>: on a project&apos;s COIs tab, click <strong>Request link</strong>. Copy it, or fill
              in <strong>Email it</strong> and click <strong>Send</strong>. The project&apos;s contacts and anyone who requested
              before show as one-click suggestions, and replies come back to you. The GC can reuse the link for every COI on
              that project. Holders already used on the project show as{" "}
              <strong>Used before</strong> buttons so a repeat request is one click for them.
            </LI>
            <LI>
              <strong>General link</strong>: on <strong>Insurance &amp; COIs → Requests</strong>. For requests not tied to a
              project link. They type the project, and you pick it on the request.
            </LI>
            <LI>
              Set <strong>Email new requests to</strong> on the Requests tab so someone hears about new requests. New
              requests also show on the dashboard and as a count on the Requests tab.
            </LI>
          </UL>
        </Step>

        <Step n={7} title="Working a request">
          Open requests show at the top of the project&apos;s COIs tab and on the Requests tab.
          <UL>
            <LI>
              <strong>Save to holders</strong> adds a holder you don&apos;t have yet to Certificate Holders with the
              request&apos;s requirements. <strong>Saved holder</strong> means one already matches.
            </LI>
            <LI>
              <strong>Add COI</strong> opens the Add COI form already filled in for that holder. Once every holder on the
              request has a COI, the request is marked <strong>Done</strong> on its own.
            </LI>
            <LI>
              <strong>Sent to broker</strong> marks it as waiting on the broker, for when CoverDash puts it in pending review.{" "}
              <strong>Mark done</strong> and <strong>Cancel</strong> close it by hand.
            </LI>
          </UL>
        </Step>

        <Step n={8} title="Renewals">
          When a policy renews, edit it on <strong>Our Policies</strong> and update its dates. The save message tells you how
          many COIs now need a new version.
          <UL>
            <LI>
              <strong>Insurance &amp; COIs → Renewals</strong> lists every current COI on an unpaid project that needs a new
              version, and why: a policy on it renewed or was replaced, or it expires within 30 days.
            </LI>
            <LI>
              Make the new COI in CoverDash (it often regenerates them in a batch after a renewal), then click{" "}
              <strong>New version</strong>. The project opens with Add COI filled in for that company and the last place it was
              sent. Once added, the old one shows as Replaced and drops off the list.
            </LI>
            <LI>
              You can also click a current COI on a project and use <strong>New version</strong> there.
            </LI>
          </UL>
        </Step>

        <Step n={9} title="Contacts tab">
          Our broker, agent, and carrier contacts. Click <strong>+ Add contact</strong>, or click a row to edit it. Put what they
          handle (for example &quot;Broker, all policies&quot;) in <strong>Handles</strong>. Click an email or phone number to
          email or call.
        </Step>
      </Steps>
    </>
  );
}
