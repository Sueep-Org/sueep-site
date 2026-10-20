import { Callout, H2, H3, P, UL, LI, A } from "@/app/erp/components/help/HelpComponents";

export function PipelineBoardHelp() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        <strong>Pipeline</strong> (left menu, Projects) shows every post-construction deal from HubSpot as a card, in a column
        for its stage, like HubSpot&apos;s board view. It goes from the first stage through <strong>Work Completed</strong>,
        with <strong>Deal Lost</strong> last. Admins, Project Managers, the Business Manager, Sales and Estimation can open it.
        It&apos;s read live from HubSpot and refreshed every hour.
      </P>
      <P>
        The buttons under the title switch between the <strong>Post-construction</strong> and <strong>Janitorial</strong>{" "}
        pipelines. Janitorial works the same way, with a few differences: it shows the company instead of the GC, and it has
        no type of work dots or price flags, since those compare post-construction jobs. Its won stages start at Active
        Turnovers, and Not Awarded counts as lost.
      </P>
      <Callout type="info">
        The board can change four things in HubSpot: a deal&apos;s stage (drag the card or use Move to), its info (owner, GC,
        dates, amount, sq ft), its lost reason, and marking an open deal lost. Next steps are kept in the ERP. The board
        picks up changes made in HubSpot on the next refresh (within an hour).
      </Callout>

      <H2>Moving cards</H2>
      <UL>
        <LI>
          Drag an open card onto another column to change its stage in HubSpot. Columns you can drop on get a dashed
          outline, and the one under the card turns pink.
        </LI>
        <LI>
          On a phone, or without a mouse, use <strong>⋯ &gt; Move to</strong> and pick the stage. Same rules as dragging.
        </LI>
        <LI>
          Between open stages it moves right away, and an <strong>Undo</strong> button shows at the bottom for 10 seconds.
        </LI>
        <LI>Dropping on Deal Lost (Not Awarded on janitorial) asks for the reason first, same as Mark lost.</LI>
        <LI>
          Dropping on a won stage (Quote Approved and later) asks you to confirm, because the next HubSpot sync creates an ERP
          project for it. Moving it back later doesn&apos;t remove that project.
        </LI>
        <LI>
          Won cards (Quote Approved and later) only move <strong>forward</strong>: Quote Approved to WIP to Billing to Work
          Completed. Each move asks to confirm and has no Undo, because the next HubSpot sync updates the ERP project:
          Billing marks it billed, and Work Completed marks it Complete (and paid, if it was billed).
        </LI>
        <LI>
          Won cards never move back or to lost from the board: moving a won deal to lost would make the sync delete its ERP
          project. Lost cards don&apos;t move either. Do those in HubSpot if you really need to.
        </LI>
        <LI>
          If someone moved the deal in HubSpot since the board loaded, the move is refused and asks you to reload, so a
          newer change is never overwritten. Every move shows in the deal panel&apos;s ERP history with who made it.
        </LI>
      </UL>

      <H2>This week and the forecast</H2>
      <UL>
        <LI>
          The row above the board compares today with the pipeline saved a week ago. A colored bar shows what happened to
          last week&apos;s open deals: <strong>Moved forward</strong> (blue), <strong>Won</strong> (green),{" "}
          <strong>Closed lost</strong> (orange) and <strong>Same stage</strong> (gray), with the count for each below it.
          Next to it: <strong>New</strong> deals and their $, and <strong>Open pipeline</strong> with a line showing the last
          30 days. The ERP saves the pipeline every morning, so this starts a day after it goes live and compares a full
          week from the eighth day on.
        </LI>
        <LI>
          <strong>Forecast</strong> (post-construction): each open deal&apos;s amount times its chance to win, added up, drawn
          as a bar next to a gray bar for what we really won.
          Clean up deals are left out because they&apos;re usually dead. Next to it is what we really won from bids created
          in the last 12 months, for scale. It&apos;s a rough guide, not a promise, and it gets more honest as old deals are
          cleaned up.
        </LI>
        <LI>The Business Manager sees the same numbers on the dashboard&apos;s Sales tab (Pipeline this week).</LI>
      </UL>

      <H2>What&apos;s on a card</H2>
      <P>
        Cards are kept short so the board is easy to scan. Hover a card for all its details, or click it to open the deal
        panel. Every filter still finds everything, even what a card doesn&apos;t show.
      </P>
      <UL>
        <LI>The deal name (opens the deal in HubSpot), the GC, the HubSpot Amount, and a circle with the owner&apos;s initials.</LI>
        <LI>
          The GC is matched to <A href="/erp/help/companies/companies-overview">Companies</A> the same way as{" "}
          <A href="/erp/help/sales/win-loss">Win/Loss</A>. A matched GC links to its company page.
        </LI>
        <LI>
          <strong>One flag</strong>, the thing that needs attention most, in this order: <strong>Clean up</strong>, a bid due
          in the next 3 days (<strong>Bid Oct 22</strong>), <strong>Stuck</strong>, <strong>Fix</strong> (missing info),{" "}
          <strong>Quiet</strong>, a price flag (like <strong>+40% price</strong> or <strong>Check price</strong>), then{" "}
          <strong>Skip?</strong>. Each is explained below.
        </LI>
        <LI>A next step, only when it&apos;s due this week (amber) or late (red).</LI>
        <LI>
          On post-construction, a colored <strong>stripe</strong> on the left edge for the chance to win: green for Strong,
          gray for Fair, none for Long shot. The key is next to the search box.
        </LI>
        <LI>
          Lost cards show only the next thing to do: <strong>Add reason</strong>, <strong>Who won?</strong> or{" "}
          <strong>Re-bid with ...</strong>. When there&apos;s nothing left to do, the reason shows in gray.
        </LI>
        <LI>
          Owners whose HubSpot user was turned off show as <strong>(inactive)</strong> in the hover text and Owner filter.
          Their deals usually need a new owner.
        </LI>
      </UL>
      <P>
        Each column shows how many deals it has and their total amount. Cards are sorted with the most recent activity on top.
      </P>

      <H3>Older deals</H3>
      <P>
        Lead (LEADS on janitorial), the won stages and the lost stage only show deals created or active in the last 90 days,
        so the board stays short. The column header says how many older ones are hidden. Pick <strong>All</strong>{" "}
        under Older deals in the filter to see every deal. The other stages always show every deal.
      </P>

      <H2>Chance to win</H2>
      <UL>
        <LI>
          Open post-construction cards show it as a stripe on the left edge: green for <strong>Strong</strong>, gray for{" "}
          <strong>Fair</strong>, none for <strong>Long shot</strong>. It comes from how our past bids turned out, by where the bid came from (HubSpot&apos;s
          How the customer reach Sueep), the GC&apos;s record with us, job size and type of work. No AI, just our own win
          rates.
        </LI>
        <LI>
          Strong is about a 15% chance or better, Fair 4% to 15%, Long shot under 4%. Hover the card or open the panel for the
          percent and the reasons, like &quot;Existing client: won 33 of 107&quot;.
        </LI>
        <LI>
          A group with only a few past bids leans on our overall win rate, so one lucky win doesn&apos;t make a GC look
          great. A signal that&apos;s missing (no GC, unknown type of work) is left out, not guessed.
        </LI>
        <LI>
          The panel shows how it did on past bids: we scored the newest quarter of decided bids using only the older ones,
          and Strong bids won about 1 in 3, Long shots about 1 in 15.
        </LI>
        <LI>
          <strong>Sort &gt; Chance to win</strong> in the filter puts the best odds on top of each column.{" "}
          <strong>Only show &gt; Strong chance</strong> shows just those.
        </LI>
        <LI>
          <strong>Bid or skip:</strong> on Lead, Contact Established and Bidding deals, the hover text and panel show the
          GC&apos;s record with us, like &quot;0 won of 23 bids&quot;. A <strong>Skip?</strong> flag means 10 or more bids
          with that GC and no wins. It&apos;s only a hint.
        </LI>
        <LI>
          The badge also shows on the dashboard&apos;s Bids and Bids due cards and in the Monday email. Janitorial
          doesn&apos;t have one yet: too few lost deals to learn from.
        </LI>
      </UL>

      <H2>Deal panel</H2>
      <P>
        Click anywhere on a card to open the deal&apos;s panel on the right. It&apos;s built around one question: what helps
        us win this deal? The deal name still opens HubSpot, and the card&apos;s own buttons still open their editors.
      </P>
      <UL>
        <LI>
          <strong>At the top:</strong> the amount, the stage and how long it&apos;s been there, and the chance to win as a
          meter. The line on the meter is our average win rate, so you can see at a glance if this deal is above or below it.
        </LI>
        <LI>
          <strong>Do next:</strong> up to three things that would help most right now, each with its button. For example: a
          late next step, a deal that hasn&apos;t moved, no next step, missing info, a price that looks off, or a GC we&apos;ve
          never won with. On lost deals: add the reason, say who won, or re-bid. Green means it&apos;s on track.
        </LI>
        <LI>
          <strong>Why this chance:</strong> one bar for each thing the chance is based on (where the bid came from, the
          GC, job size, type of work), showing how often bids like that won for us. The line is our average: bars past it
          help, bars short of it hurt.
        </LI>
        <LI>
          <strong>Price per sq ft:</strong> this deal&apos;s price against the usual range for its type of work. The
          shaded part is the usual range and the dark mark is this deal.
        </LI>
        <LI>
 When the GC has 3 or more priced bids of this type of work, small bars compare what we quote them, what we win at
          with them (once there are 3 wins) and what we usually win at.
        </LI>
        <LI>
          Below that: key dates, then <strong>Activity</strong> (calls, notes, tasks, meetings), the{" "}
          <strong>Quote</strong> line items and <strong>Changes from the ERP</strong>, each showing the newest few with Show
          all. Emails show as a count with a link to HubSpot until the ERP is allowed to read them.
        </LI>
        <LI>All the actions are in one row at the bottom: Next step, Edit info, Move to, Mark lost (or the lost reason and Re-bid).</LI>
        <LI>Escape, the ×, or clicking outside closes it.</LI>
      </UL>

      <H2>Missing info and Edit info</H2>
      <UL>
        <LI>
          A blue <strong>Fix</strong> flag (with a number) means an open deal is missing something its stage needs. Every
          open deal needs an active owner and a GC. From Bidding on, post-construction deals need a Bid Date. In the quote
          stages (Proposal on janitorial) they need an amount, and post-construction ones also need Area SQFT. Hover the card
          to see what&apos;s missing.
        </LI>
        <LI>
          Click <strong>Fix</strong>, or <strong>⋯ &gt; Edit info</strong>, to change the owner, GC, Bid Date, Job Walk Date,
          amount or Area SQFT. Saving updates the HubSpot deal; only the fields you change are sent. Leave a field blank to
          clear it.
        </LI>
        <LI>
          Owners come from HubSpot&apos;s active users. A deal owned by someone who left keeps that owner until you pick a
          new one.
        </LI>
        <LI>
          For the GC, pick a company or choose <strong>Other</strong> and type the name. Admins and the Business Manager can
          then pick <strong>Same company as</strong> to add that spelling to the company&apos;s other names, so those deals
          count for it from then on.
        </LI>
        <LI>
          <strong>Only show &gt; Missing info</strong> lists every deal with a Fix badge, with a count per field above the
          board. Click a count to see only those.
        </LI>
        <LI>Only open deals can be edited here. Change won and lost deals in HubSpot.</LI>
      </UL>

      <H2>Next steps</H2>
      <UL>
        <LI>
          Every open deal can have one next step: what has to happen and by when, like &quot;Call the GC about the bid, Oct
          24&quot;. It shows on the card when it&apos;s due this week (amber) or late (red); otherwise hover or open the panel
          to see it.
        </LI>
        <LI>
          Add one from the card&apos;s <strong>⋯</strong> menu or the deal panel. Click it to change the date or text, or
          click <strong>Done</strong> when it&apos;s finished, then add the next one.
        </LI>
        <LI>
          Next steps are expected from Bidding through Competitive Quote (Walkthrough and Proposal on janitorial). Cards there
          without one are listed by <strong>Only show &gt; No next step</strong>.{" "}
          <strong>Overdue next step</strong> lists the late ones.
        </LI>
        <LI>
          Next steps are saved in the ERP only; they don&apos;t show in HubSpot. Anyone who can see the board can add or finish
          them.
        </LI>
        <LI>
          Every Monday morning, each deal owner with an ERP login gets an email with their overdue next steps, the ones due
          this week, and deals with none yet. Admins get a summary for everyone, including deals owned by people no longer
          active in HubSpot. Both can be turned off on the Notifications page.
        </LI>
        <LI>
          The dashboard&apos;s <strong>Bids</strong> card (Sales tab) and <strong>Bids due</strong> card (Estimation&apos;s
          Queue tab) have a <strong>Follow-ups</strong> tab with your next steps overdue or due this week.
        </LI>
      </UL>

      <H2>Lost reasons and Mark lost</H2>
      <UL>
        <LI>
          A pink <strong>Add reason</strong> on a lost card means HubSpot&apos;s Deal Lost Reason is blank: click it, pick one
          or more reasons and save. Click the gray reason (or use the panel) to change it.
        </LI>
        <LI>
          Open cards have a <strong>⋯</strong> menu with <strong>Mark lost</strong>. It asks for the reason, then moves the
          deal to Deal Lost (Not Awarded on janitorial) in HubSpot. This is the quickest way to close out Clean up deals.
          Marking a deal lost never creates an ERP project.
        </LI>
        <LI>
          Picking <strong>GC Not Awarded</strong> also asks which GC won the job and their price, both optional. These are
          saved in the ERP only, so we can bid the next job with the GC who won.
        </LI>
        <LI>
          Changes show on the board right away and in HubSpot within a minute. Every change is logged with who made it.
        </LI>
        <LI>
          <strong>Only show &gt; Needs a reason</strong> lists lost deals with no reason. Pick All under Older deals to
          work through the older ones too.
        </LI>
      </UL>

      <H2>Re-bid with the GC that won</H2>
      <UL>
        <LI>
          When we lose because our GC wasn&apos;t awarded the job (<strong>GC Not Awarded</strong>), another GC got the work
          and still needs a cleaning or painting sub. Re-bidding with them is one of our best chances to win the job after
          all.
        </LI>
        <LI>
          Lost cards with GC Not Awarded show <strong>Who won?</strong> until someone records the GC that won (and their
          price, if known). Click it to fill it in. <strong>Only show &gt; Who won?</strong> lists the ones from the last
          year; pick Older deals &gt; All to see all of them.
        </LI>
        <LI>
          Once a winner is in, the card shows <strong>Re-bid with ...</strong>. It asks you to confirm the new deal&apos;s
          name and owner (it starts on the lost deal&apos;s owner when they&apos;re still active), then creates a new
          post-construction deal in HubSpot at Lead with the same amount, Area SQFT and Type of business. Company is the GC
          that won, and the Deal Description says which deal it came from. The lost deal stays lost.
        </LI>
        <LI>
          After that the card shows <strong>Re-bid made</strong>, linking to the new deal. Each lost deal can be re-bid once.
          <strong> Only show &gt; Ready to re-bid</strong> lists the ones with a winner but no re-bid yet.
        </LI>
        <LI>
          The new deal shows in Lead after the next refresh (within an hour). Win/Loss has a Re-bids section with how many
          were made and how they turned out.
        </LI>
      </UL>

      <H2>Stuck, Clean up and Quiet</H2>
      <UL>
        <LI>
          <strong>Stuck</strong>: the deal has been in its open stage longer than that stage allows. Quote Sent and Proposal
          allow 30 days, Negotiation and Competitive Quote 21, every other open stage 14. The badge shows the days, and each
          column header says how many are stuck.
        </LI>
        <LI>
          <strong>Clean up</strong>: 180 days or more in one open stage. These are usually dead deals nobody closed out.
          Open them in HubSpot and mark them lost (or move them on) so the board stays honest.
        </LI>
        <LI>
          <strong>Quiet</strong>: a stale quote, in Quote Sent through the stage before Quote Approved with no activity for
          30 days.
        </LI>
        <LI>
          Days in stage come from HubSpot&apos;s record of when the deal entered its stage. A few deals were bulk imported on
          Dec 26, 2024, so their count starts there; the hover text says so.
        </LI>
      </UL>

      <H2>Search and filters</H2>
      <UL>
        <LI>The search box finds deals by name or GC.</LI>
        <LI>
          The filter button (top right) narrows the board by owner, GC, company type (GCs, property managers and owners,
          not linked, no company), type of work, older deals, and{" "}
          <strong>Only show</strong> Who won?, Ready to re-bid, Strong chance, Missing info, Overdue next step, No next step, Stuck, Clean up, stale quotes, price flags or Needs a
          reason. It turns pink when anything other than
          the starting view is picked. Reset filters goes back to the starting view.
        </LI>
        <LI>
          <strong>Bid due</strong> uses HubSpot&apos;s Bid Date: next 7 days, next 30 days, past due, no bid date, or your own
          dates. Picking a range sorts each column by bid date, soonest first.
        </LI>
        <LI>
          The Owner filter has <strong>Me</strong> (your own deals, when your ERP email is a HubSpot owner) and{" "}
          <strong>No owner</strong>. Sales and Estimation open the board on Me; pick All owners to see everyone.
        </LI>
        <LI>The count and total next to the search box follow the filters.</LI>
      </UL>
      <Callout type="tip">
        Column counts can be checked against HubSpot&apos;s own board for the post-construction pipeline. With All picked
        under Older deals and no other filters, they should match.
      </Callout>
    </>
  );
}
