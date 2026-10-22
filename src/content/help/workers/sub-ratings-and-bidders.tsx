import { A, Callout, H2, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function SubRatingsAndBidders() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        Every sub gets two star scores, so you can see at a glance who to trust and who prices well. Subs who bid but
        we haven&apos;t worked with yet are kept on the <strong>Bidders</strong> tab with their bid history. Bids are logged
        on each project&apos;s Proposals tab (see <A href="/erp/help/projects/sub-proposals">Sub Bids (Proposals)</A>).
      </P>

      <H2>The two scores</H2>
      <UL>
        <LI>
          <strong>Confidence:</strong> the average of everyone&apos;s ratings of the sub on quality, reliability and
          communication.
        </LI>
        <LI>
          <strong>Pricing:</strong> worked out from their bids and the jobs we paid them on (see below), unless someone set it
          by hand.
        </LI>
      </UL>
      <P>
        Scores show as stars, part-filled for averages, with the exact number in small gray next to them, like 4.3. You see
        them at the top of the sub&apos;s profile, in the <strong>Confidence</strong> and <strong>Pricing</strong> columns on
        the Contractors list, and next to the sub on a project&apos;s Proposals tab.
      </P>

      <H2>Rating a sub</H2>
      <Steps>
        <Step n={1} title="1. Open their Ratings tab">
          On the sub&apos;s profile, open <strong>Ratings</strong> and press <strong>Rate this sub</strong>.
        </Step>
        <Step n={2} title="2. Pick the stars">
          Click 1 to 5 stars for <strong>Quality</strong>, <strong>Reliability</strong> and <strong>Communication</strong>.
          1 star is poor, 5 is great. Optionally pick the job it&apos;s about and add a note, then press{" "}
          <strong>Save</strong>.
        </Step>
      </Steps>
      <P>
        Every rating stays listed with who gave it, the job and the note (hover the i). Only the person who gave a rating, or
        an Admin, can delete it.
      </P>

      <H2>How the pricing score works</H2>
      <P>It averages two parts. A sub with only one part gets that one.</P>
      <UL>
        <LI>
          <strong>Vs other subs:</strong> how their bids compare with the cheapest other sub on the same work. Lowest or tied
          is 5 stars, up to 5% over is 4, up to 15% over is 3, up to 30% over is 2, more is 1. Only bids where another sub
          also bid count.
        </LI>
        <LI>
          <strong>Margin kept:</strong> our average margin on their jobs. 50% or more is 5 stars, 40% is 4, 30% is 3, 20% is
          2, less is 1.
          <UL>
            <LI>Awarded bids count at the bid&apos;s margin.</LI>
            <LI>
              Jobs we paid them on count at the whole job&apos;s labor margin: the contract (with change orders) minus every
              sub&apos;s pay and our employees&apos; labor. A unit two subs worked counts the same for both.
            </LI>
            <LI>A job they have an awarded bid on and were also paid on counts once, as the bid.</LI>
          </UL>
        </LI>
      </UL>
      <P>
        Open <strong>Jobs counted</strong> on the Pricing card to see which jobs went in and each one&apos;s margin.
      </P>
      <Callout type="info">
        A job&apos;s margin is only as good as its logs. If labor wasn&apos;t logged on a job, its margin looks higher than it
        was.
      </Callout>
      <P>
        Disagree? Press <strong>Set by hand</strong> on the Pricing card, pick the stars and say why. The card shows it was set
        by hand, by whom, and what it would work out to. Press <strong>Use bids instead</strong> to go back.
      </P>

      <H2>Bidders: subs we haven&apos;t worked with</H2>
      <P>
        On the Contractors page, the <strong>Bidders</strong> tab lists subs who bid but don&apos;t have a profile. Bids with
        the same email, or the same name and company, are one sub. Each row shows their contact info, how many times they
        bid, their last bid, and:
      </P>
      <UL>
        <LI>
          <strong>Usually:</strong> how their bids compare with the cheapest other sub on the same work. Green means under,
          amber a little over, red 10% or more over.
        </LI>
        <LI>
          <strong>Avg margin:</strong> what percent of our price their bids would leave us.
        </LI>
      </UL>
      <P>Click a row to see every bid. Use the search box to find someone by name, company or email.</P>

      <H2>Giving a bidder a profile</H2>
      <P>When you decide to work with a bidder, their bids can come with them.</P>
      <UL>
        <LI>
          <strong>From the Bidders tab:</strong> press <strong>Create profile</strong> on their row. Their name, contact and
          email are filled in; add their role and save. All their bids move onto the new profile, and you land on its Bids
          tab.
        </LI>
        <LI>
          <strong>Made the profile another way?</strong> If any no-profile bid has the same email, phone, name or company as
          the profile (including the company info on their questionnaire), the profile shows a yellow{" "}
          <strong>past bids may be from this sub</strong> note. Press <strong>Review</strong>, uncheck any that aren&apos;t
          theirs, and press <strong>Link</strong>.
        </LI>
        <LI>
          <strong>Not suggested?</strong> On the profile&apos;s <strong>Bids</strong> tab, press <strong>Link past bids</strong>,
          search, and pick them.
        </LI>
      </UL>
      <P>
        Nothing is linked until you press Link or Create profile. Linked a bid by mistake? Edit it on the project&apos;s
        Proposals tab and switch it to <strong>No profile yet</strong>.
      </P>

      <H2>Who can see it</H2>
      <P>
        Admins, Project Managers, Business Managers, Sales and Estimation. Supervisors and employees don&apos;t see the
        Bidders tab, the Bids or Ratings tabs, or any scores.
      </P>
    </>
  );
}
