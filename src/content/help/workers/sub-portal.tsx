import { A, Callout, H2, H3, P, UL, LI, Steps, Step, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function SubPortal() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        Every sub has their own jobs page (the sub portal) that works on a phone, in English or Spanish. From it they answer
        job offers, see their upcoming and past jobs, check in and out on the day, take before and after photos, and send
        back fixes when a review asks for them. You run all of it from the ERP: the Schedule, the sub&apos;s profile, Sub
        Reviews and Settings.
      </P>
      <Callout type="info">
        Subs only ever see their own pay. Charge prices, margins, ratings and scores never show on their page or in their
        emails.
      </Callout>

      <H2>1. Give a sub their page</H2>
      <Steps>
        <Step n={1} title="1. Open their profile">
          On <strong>Contractors</strong>, open the sub. They need an email address and must be active.
        </Step>
        <Step n={2} title="2. Email portal link">
          In the <strong>Sub portal</strong> section on the Overview tab, press <strong>Email portal link</strong>. They get
          a welcome email with their link.
        </Step>
        <Step n={3} title="3. They sign in once per phone">
          The first time they open it on a phone, they get a sign-in code by email. That phone stays signed in after that.
        </Step>
      </Steps>
      <P>
        <strong>Make new link</strong> replaces the old link (the old one stops working and every phone has to sign in
        again). Use it if a link was forwarded to the wrong person. Schedule invite emails also carry an{" "}
        <strong>Open my Sueep page</strong> button.
      </P>

      <H2>2. What the sub sees</H2>
      <UL>
        <LI>
          <strong>Offers:</strong> jobs waiting for their answer, with the address, dates, scope, their pay and the
          answer-by time.
        </LI>
        <LI>
          <strong>Today:</strong> today&apos;s jobs with big <strong>Check in</strong> and <strong>Check out</strong>{" "}
          buttons, and before and after photos.
        </LI>
        <LI>
          <strong>Upcoming:</strong> booked jobs with scope, a map link, their crew size (they can change it up to the day
          before) and <strong>Request a change order</strong>.
        </LI>
        <LI>
          <strong>Past:</strong> the last 6 months of jobs, their pay and whether each day passed review.
        </LI>
        <LI>
          <strong>Fixes needed</strong> cards show above the tabs whenever a review asked for fixes.
        </LI>
      </UL>
      <P>
        The page opens in the language on their profile; they can switch English and Spanish at the top. A{" "}
        <strong>How this page works</strong> section at the bottom explains each tab to them in their language.
      </P>

      <H2>3. Sending a job offer</H2>
      <Steps>
        <Step n={1} title="1. Open the day on the Schedule">
          On a turnover or post-construction day (or a change order day), click <strong>Offer to a sub</strong>. Only roles
          that see prices have it.
        </Step>
        <Step n={2} title="2. Pick the sub, pay and answer-by">
          The list puts the best Overall score first. The pay starts from the sub pay on the day. The answer-by starts at
          the hours set on Settings, Subs (24 by default), never later than 2 PM the day before the job. Change either one
          if you need to.
        </Step>
        <Step n={3} title="3. Send">
          The sub gets an email and the offer shows on their Offers tab. The day card shows <strong>Offered</strong>.
        </Step>
      </Steps>
      <UL>
        <LI>
          <strong>Accepted:</strong> they&apos;re booked on the day like picking them by hand, the invite is marked
          confirmed, they say how many people they&apos;re bringing, and you get an email.
        </LI>
        <LI>
          <strong>Declined:</strong> they must give a reason. You and the people on &quot;Sub job offer declined&quot;
          (Email Settings) get an email. If it was over price, press <strong>Resend at new price</strong>; every round is
          kept under <strong>Show offer history</strong>.
        </LI>
        <LI>
          <strong>Expired:</strong> no answer by the answer-by time. The team is emailed; send it again or offer it to
          someone else.
        </LI>
      </UL>
      <P>An offer goes to one sub at a time. There are no counter-offers; price changes go through Resend at new price.</P>

      <H2>4. On the day: check-in, photos, check-out</H2>
      <UL>
        <LI>
          <strong>Check in / Check out:</strong> the phone&apos;s location is taken only at the tap, never all day. Farther
          than the Settings distance from the job still saves, but shows <strong>Off site</strong> on the day card. After
          the start time plus the grace window it shows <strong>Late</strong>, and the day&apos;s PM is emailed if the sub
          running the day hasn&apos;t checked in.
        </LI>
        <LI>
          <strong>Crew:</strong> at check-in the sub running the day confirms how many people came. The day card shows
          came vs planned.
        </LI>
        <LI>
          <strong>Photos:</strong> camera only, stamped with the time. The sub running the day can&apos;t check out until
          they have the before and after minimums from Settings. If they truly can&apos;t, a PM, Business Manager or Admin
          clicks <strong>Let them check out without</strong> on the day card and gives a reason.
        </LI>
        <LI>
          <strong>No signal:</strong> taps and photos wait on the phone and send with their own time when signal comes back
          (up to 2 hours).
        </LI>
      </UL>
      <P>
        Photos show on the project&apos;s <strong>Sub Photos</strong> tab, and on turnovers at the top of the Checklist tab
        too.
      </P>

      <H2>5. Reviewing the work</H2>
      <P>
        When the sub running a day checks out, the day lands on <strong>Sub Reviews</strong> (under Projects) and the
        day&apos;s PM gets an email. Open it to see before and after photos side by side.
      </P>
      <UL>
        <LI>
          <strong>Pass:</strong> rate quality, reliability and communication (1 to 5 stars, all three needed). That rating
          feeds the sub&apos;s Confidence score.
        </LI>
        <LI>
          <strong>Needs fix:</strong> pick the rooms or type the items, add a note and photos if useful. The sub gets a
          Fixes needed card and an email in their language, sends fix photos back, and the day comes back to you. It
          repeats until it passes.
        </LI>
        <LI>
          Tick <strong>I checked this on site</strong> to also save a quality check on the project.
        </LI>
      </UL>
      <P>
        Business Managers and Admins can review any day. PMs review their own days and days with no PM. Supervisors
        don&apos;t review. The Contractors page has a <strong>Reviews</strong> tab with every open review.
      </P>

      <H2>6. Scores</H2>
      <P>
        What happens in the portal feeds the <strong>Field</strong> score (on time, offers accepted, passed first time,
        crew showed up), which goes into <strong>Overall</strong>. See{" "}
        <A href="/erp/help/workers/sub-ratings-and-bidders">Rating Subs and Bidders</A>.
      </P>

      <H2>7. Turning a page off</H2>
      <P>
        On <strong>Users</strong>, the <strong>Subs</strong> tab lists every sub with a page: link status, last opened,
        signed-in phones and recent activity (sign-ins, offers answered, check-ins, photos, fixes). <strong>Turn off
        page</strong> stops the link at once and signs out every phone (a reason is asked and kept). <strong>Turn back
        on</strong> sends a new link. Nothing about the sub or their history is deleted.
      </P>

      <H2>8. Rules you can change (Settings, Subs)</H2>
      <Table>
        <THead>
          <tr>
            <TH>Setting</TH>
            <TH>Default</TH>
            <TH>What it does</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Time subs get to answer an offer</TD>
            <TD>24 hours</TD>
            <TD>Starting answer-by on new offers (capped at 2 PM the day before).</TD>
          </tr>
          <tr>
            <TD>Flag check-ins farther than this</TD>
            <TD>400 meters</TD>
            <TD>Past this, check-ins and photos show Off site.</TD>
          </tr>
          <tr>
            <TD>Grace window after the start time</TD>
            <TD>15 minutes</TD>
            <TD>Later than this is Late, and the PM is emailed if they haven&apos;t checked in.</TD>
          </tr>
          <tr>
            <TD>Before and after photos needed</TD>
            <TD>2 and 2</TD>
            <TD>Separate numbers for turnovers and other jobs. 0 turns it off.</TD>
          </tr>
          <tr>
            <TD>Quality check must pass before billing</TD>
            <TD>Off</TD>
            <TD>When on, a job can&apos;t be marked Billed while a sub&apos;s day on it is waiting for review or fixes.</TD>
          </tr>
          <tr>
            <TD>Field score: days of history</TD>
            <TD>180 days</TD>
            <TD>How far back the Field score looks.</TD>
          </tr>
          <tr>
            <TD>Field score: days or offers needed</TD>
            <TD>3</TD>
            <TD>Each part of the Field score counts only once it has this many behind it.</TD>
          </tr>
        </tbody>
      </Table>

      <H3>Emails</H3>
      <P>
        Who gets the staff emails (offer declined, sub hasn&apos;t checked in, crew changed, review ready) is set on Email
        Settings. The day&apos;s PM or the person who sent the offer always gets theirs.
      </P>
    </>
  );
}
