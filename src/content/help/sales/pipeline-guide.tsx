import { Callout, H2, H3, P, UL, LI, Steps, Step, A, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

/**
 * Plain how-to for the sales team: why the pipeline board exists and what to
 * do each week. Button-by-button details live in pipeline-board.tsx. Update
 * this guide at the end of every PIPELINE_PLAN phase.
 */
export function PipelineGuide() {
  return (
    <>
      <H2>Why we have it</H2>
      <P>
        The <strong>Deals</strong> board (left menu, Projects) is there to help us win more of the jobs we bid on, by making
        sure no deal gets forgotten. When we built it (October 2026), HubSpot showed:
      </P>
      <UL>
        <LI>We win about 6 out of every 100 post-construction bids.</LI>
        <LI>Most open quotes hadn&apos;t moved in months, and nobody was following up on them.</LI>
        <LI>Almost half of the lost deals had no reason, so we couldn&apos;t learn why we lose.</LI>
        <LI>About 150 open deals belonged to people who no longer work here.</LI>
      </UL>
      <P>
        The board shows every deal from HubSpot by stage and flags the ones that need someone: deals that are stuck, quotes
        nobody has touched, prices that look off, and deals with no plan. For what every badge and button means, see{" "}
        <A href="/erp/help/sales/pipeline-board">Deals Board</A>.
      </P>
      <Callout type="info">
        HubSpot is still where deals live. The board reads from it every hour. Moving cards, Edit info, lost reasons and
        Mark lost save straight to HubSpot. Next steps are kept in the ERP.
      </Callout>

      <H2>Who does what</H2>
      <Table>
        <THead>
          <tr>
            <TH>Who</TH>
            <TH>What</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Sales and Estimation</TD>
            <TD>Keep a next step on every live deal you own, close out dead ones, and give every lost deal a reason.</TD>
          </tr>
          <tr>
            <TD>Admins and the Business Manager</TD>
            <TD>
              Read the Monday summary and the This week row above the board (new, moved forward, won, lost, forecast). Pick up
              or hand out deals owned by people who left, and check that nothing sits overdue.
            </TD>
          </tr>
        </tbody>
      </Table>

      <H2>Once: clean up the board</H2>
      <P>Do this once so the board only shows deals that are really live. After that, the weekly routine keeps it clean.</P>
      <Steps>
        <Step n={1} title="Close out dead deals">
          Open Deals and click the <strong>Clean up</strong> quick view above the board. These deals have sat in one
          stage for 180 days or more. For each one: if it&apos;s dead, click <strong>⋯ &gt; Mark lost</strong> and pick the
          reason. If it&apos;s still alive, add a next step instead.
        </Step>
        <Step n={2} title="Give orphaned deals an owner">
          In the filter, open <strong>Owner</strong> and pick each name marked <strong>(inactive)</strong>. Those people
          left. Click <strong>⋯ &gt; Edit info</strong> on each deal and pick someone who will follow up. It saves to HubSpot
          right away.
        </Step>
        <Step n={3} title="Fill in missing info">
          Tick <strong>Only show &gt; Missing info</strong>. The counts above the board show what&apos;s missing most (owner,
          GC, Bid Date, amount, sq ft). Click the blue <strong>Missing</strong> flag on a card to fill it in. Amounts and square footage feed the
          price flags and Win/Loss, so start with live quotes.
        </Step>
        <Step n={4} title="Fill in old lost reasons (when there's time)">
          Tick <strong>Only show &gt; Needs a reason</strong> and set <strong>Older deals</strong> to All. Click{" "}
          <strong>Add reason</strong> on each one you remember. Every reason makes the Win/Loss numbers more useful.
        </Step>
      </Steps>

      <H2>Every week</H2>
      <Steps>
        <Step n={1} title="Monday: read your email">
          Each deal owner with an ERP login gets <strong>Deals this week</strong>: next steps that are overdue, due this
          week, and deals with no next step yet. Admins get one summary for everyone.
        </Step>
        <Step n={2} title="Open the board on your deals">
          Sales and Estimation open Deals on their own deals (Owner: Me). The same list is on your dashboard, in the{" "}
          <strong>Follow-ups</strong> tab of the Bids card.
        </Step>
        <Step n={3} title="Clear the red">
          Click the <strong>My to-dos</strong> quick view. Late next steps show in red. Click a card to open its panel: the latest calls and notes,
          the quote&apos;s line items and the GC&apos;s record are all there. Do the step, click <strong>Done</strong>, and add
          what comes next. If it can&apos;t happen yet, move the date.
        </Step>
        <Step n={4} title="Give every live deal a plan">
          Filter <strong>Only show &gt; No next step</strong>. Add a next step to each: who to call, what to send, by when.
          Deals from Bidding to Competitive Quote (Walkthrough and Proposal on janitorial) should always have one.
        </Step>
        <Step n={5} title="Check stuck and quiet deals">
          A <strong>Stuck</strong> or <strong>Quiet</strong> flag means the deal isn&apos;t moving. Call, then drag the card
          to its new stage (or use <strong>⋯ &gt; Move to</strong>), or mark it lost if it&apos;s over.
        </Step>
        <Step n={6} title="Fill in missing info">
          A blue <strong>Missing</strong> flag means the deal is missing something its stage needs, like a Bid Date once you&apos;re
          bidding or an amount once the quote is out. Click it and fill it in.
        </Step>
      </Steps>

      <H2>When something happens</H2>
      <H3>A deal is lost</H3>
      <P>
        Mark it lost from the board (<strong>⋯ &gt; Mark lost</strong>) or in HubSpot, and always pick a reason. If the GC
        didn&apos;t win the job (<strong>GC Not Awarded</strong>), find out which GC did. Call our GC or check the bid
        results, then record it (and their price if you know it).
      </P>
      <H3>A new lead comes in</H3>
      <P>
        Click <strong>New deal</strong> above the board, on the Post-construction or Janitorial tab. Only the name is needed,
        but add the GC, owner and Bid Date if you have them. It&apos;s created in HubSpot and shows on the board right away,
        in Lead unless you pick another stage. If a deal with a similar name is already on the board you&apos;ll see a warning,
        so check it isn&apos;t the same job first.
      </P>
      <H3>Our GC lost the job</H3>
      <P>
        The GC that won still needs a sub, so go after them. On the lost card, click <strong>Who won?</strong> and fill it
        in, then <strong>Re-bid with ...</strong>. That creates a new deal in Lead with the same job details and the new GC,
        ready to work like any other lead. Once a week, click the <strong>Lost follow-up</strong> quick view, or check{" "}
        <strong>Only show &gt; Who won?</strong> and{" "}
        <strong>Ready to re-bid</strong> so none slip by.
      </P>
      <H3>A bid is coming up</H3>
      <P>
        Use <strong>Bid due &gt; Next 7 days</strong> in the filter to see what&apos;s due soon, soonest first. Put the Bid Date
        in HubSpot on every bid so it shows here, on the dashboard and on the Management calendar.
      </P>
      <H3>Waiting to hear back</H3>
      <P>
        Use <strong>Award date &gt; Next 7 days</strong> to see which GCs should be deciding soon, soonest first. Put the Award
        Date in HubSpot when the GC tells you, so it shows here, on the dashboard and on the Management calendar.
      </P>
      <H3>Deciding where to spend time</H3>
      <P>
        Each open bid has a chance to win from how similar bids turned out for us: a green stripe on the card means Strong,
        gray means Fair, none means Long shot. Put your best effort into Strong and Fair ones, and use <strong>Sort &gt; Chance to win</strong> to
        see them first. On new leads, hover to see the GC&apos;s record; a <strong>Skip?</strong> flag means we&apos;ve bid
        with that GC 10 or more times and never won. Fill in where the bid came from in HubSpot, since that&apos;s the
        strongest signal.
      </P>
      <H3>A quote shows a price flag</H3>
      <P>
        A <strong>+%</strong> or <strong>-%</strong> badge means the price per square foot is outside what we usually win at
        for that type of work. <strong>Check</strong> usually means a typo in Area SQFT or the amount in HubSpot. Double check
        the numbers before the quote goes out.
      </P>

      <H2>Coming later</H2>
      <P>More is planned for the board. This guide is updated as each piece is added.</P>
      <UL>
        <LI>Emails in the deal panel (each one&apos;s subject, who and date), once the ERP is allowed to read them in HubSpot.</LI>
      </UL>
    </>
  );
}
