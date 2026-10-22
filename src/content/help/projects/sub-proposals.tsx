import { Callout, H2, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function SubProposals() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        Every project has a <strong>Proposals</strong> tab under <strong>Financials</strong>. Log each bid a sub gives you on
        the job there, and see the margin each one would leave us.
      </P>

      <H2>Adding a bid</H2>
      <Steps>
        <Step n={1} title="1. Open the tab">
          On the project, open <strong>Financials</strong> and pick <strong>Proposals</strong>. Press <strong>Add bid</strong>.
        </Step>
        <Step n={2} title="2. Pick the sub">
          <UL>
            <LI>
              <strong>Contractor profile:</strong> search for a sub you already have a profile for.
            </LI>
            <LI>
              <strong>No profile yet:</strong> type their name, company, email and phone. Fill in the email when you have it,
              so their bids can be linked to them later if they get a profile. If they bid before, start typing their name or
              company and pick them from the list to fill in the rest. If the list says <strong>Has a profile</strong>, pick it
              to log the bid on their profile.
            </LI>
          </UL>
        </Step>
        <Step n={3} title="3. Amount and what it covers">
          Type the bid amount and the day you got it. Under <strong>Covers</strong>, pick the SOV lines the bid is for, or
          leave it empty if it&apos;s for the whole job. The margin shows under it as you type.
        </Step>
      </Steps>

      <H2>Reading the tab</H2>
      <UL>
        <LI>Bids on the same lines are grouped, cheapest first. Whole-job bids are on top.</LI>
        <LI>
          <strong>Our price</strong> is the contract value for whole-job bids, or the total of the picked SOV lines.
        </LI>
        <LI>
          <strong>Margin</strong> is our price minus the bid, in dollars and percent. It turns red when the bid is more than
          our price.
        </LI>
        <LI>
          <strong>Lowest</strong> marks the cheapest bid still in play (Received or Awarded) when there&apos;s more than one.
        </LI>
        <LI>Change the status right on the row: Received, Awarded, Declined or Withdrawn. Declined and withdrawn bids go gray.</LI>
      </UL>
      <Callout type="info">
        Marking a bid <strong>Awarded</strong> doesn&apos;t add the sub to the job or change any costs. Add them on the{" "}
        <strong>Contractors</strong> tab as usual.
      </Callout>

      <H2>On the contractor&apos;s profile</H2>
      <P>
        Bids from a sub with a profile also show on their profile, on the <strong>Bids</strong> tab. It shows every bid they
        gave us and four numbers:
      </P>
      <UL>
        <LI>
          <strong>Bids</strong> and <strong>Awarded</strong>: how many bids, and how many we gave them.
        </LI>
        <LI>
          <strong>Avg margin</strong>: on average, what percent of our price is left after their bid.
        </LI>
        <LI>
          <strong>Vs other subs</strong>: on average, how their bid compared with the cheapest other sub on the same work, like
          &quot;8% under&quot; or &quot;12% over&quot;. Only bids where someone else also bid count.
        </LI>
      </UL>
      <P>
        The <strong>Contractors</strong> list has <strong>Bids</strong> and <strong>Avg margin</strong> columns too.
        Withdrawn bids are listed but left out of the averages. To change a bid, open the project from the Bids tab.
      </P>

      <H2>Bidders: subs we haven&apos;t worked with</H2>
      <P>
        The <strong>Contractors</strong> page has a <strong>Bidders</strong> tab for subs who bid but don&apos;t have a
        profile. Bids with the same email, or the same name and company, are one sub. Each row shows their contact info, how
        many times they bid, their last bid, and:
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
      <P>
        Click a row to see every bid. When you decide to work with them, press <strong>Create profile</strong>. Their info
        is filled in, and all their bids move onto the new profile.
      </P>

      <H2>When a sub with no profile gets one</H2>
      <P>
        Bids you logged under <strong>No profile yet</strong> can be moved onto the sub&apos;s profile once you make one, so
        their history comes with them.
      </P>
      <UL>
        <LI>
          If a bid has the same email, phone, name or company as the profile (including the company info on their
          questionnaire), the profile shows a yellow <strong>past bids may be from this sub</strong> note. Press{" "}
          <strong>Review</strong>, uncheck any that aren&apos;t theirs, and press <strong>Link</strong>.
        </LI>
        <LI>
          Not suggested? On the profile&apos;s <strong>Bids</strong> tab, press <strong>Link past bids</strong>, search, and
          pick them.
        </LI>
        <LI>Nothing is linked until you press Link.</LI>
      </UL>
      <Callout type="info">
        Fill in the sub&apos;s email when you log a bid. It&apos;s the surest way to match them later.
      </Callout>

      <H2>Scoring subs</H2>
      <P>
        Each sub has two star scores, 1 to 5 stars, on their profile&apos;s <strong>Ratings</strong> tab. They also show under their name
        at the top of the profile, on the Contractors list, and next to them on the Proposals tab.
      </P>
      <UL>
        <LI>
          <strong>Confidence:</strong> press <strong>Rate this sub</strong> and click 1 to 5 stars for <strong>quality</strong>,{" "}
          <strong>reliability</strong> and <strong>communication</strong>. You can pick the job it&apos;s about and add a
          note. Confidence is the average of everyone&apos;s ratings. Every rating stays listed, and only the person who gave
          it (or an Admin) can delete it.
        </LI>
        <LI>
          <strong>Pricing:</strong> worked out from two parts, averaged (or just one if that&apos;s all they have):
          <UL>
            <LI>
              <strong>Vs other subs:</strong> how their bids compare with the cheapest other sub on the same work. Lowest or
              tied is 5, up to 5% over is 4, up to 15% over is 3, up to 30% over is 2, more is 1.
            </LI>
            <LI>
              <strong>Margin kept:</strong> our average margin on their jobs. 50% or more is 5, 40% is 4, 30% is 3, 20% is 2,
              less is 1. Awarded bids count at the bid&apos;s margin. Jobs we paid them on count at the whole job&apos;s labor
              margin: the contract (with change orders) minus every sub&apos;s pay and our employees&apos; labor. So a unit two
              subs worked counts the same for both.
            </LI>
          </UL>
          A job they have an awarded bid on and were also paid on counts once, as the bid. Open{" "}
          <strong>Jobs counted</strong> on the Pricing card to see which jobs went in.
        </LI>
        <LI>
          Disagree with the pricing score? Press <strong>Set by hand</strong>, pick the stars and say why. The profile shows it
          was set by hand and what the bids would say. Press <strong>Use bids instead</strong> to go back.
        </LI>
        <LI>Averages show as part-filled stars, with the exact number in small gray next to them, like 4.3.</LI>
      </UL>

      <H2>Who can see it</H2>
      <P>
        Everyone who can see the project&apos;s Financials. Supervisors and employees can&apos;t see the tab, the Bids or Ratings
        tabs on profiles, the scores, or the bid columns.
      </P>
    </>
  );
}
