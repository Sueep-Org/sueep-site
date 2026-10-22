import { A, Callout, H2, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function SubProposals() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        Every project has a <strong>Proposals</strong> tab under <strong>Financials</strong>. Log each bid a sub gives you on
        the job there, and see the margin each one would leave us. Every bid also goes into that sub&apos;s history, which
        feeds their pricing score (see <A href="/erp/help/workers/sub-ratings-and-bidders">Rating Subs and Bidders</A>).
      </P>

      <H2>Adding a bid</H2>
      <Steps>
        <Step n={1} title="1. Open the tab">
          On the project, open <strong>Financials</strong> and pick <strong>Proposals</strong>. Press <strong>Add bid</strong>.
        </Step>
        <Step n={2} title="2. Pick the sub">
          <UL>
            <LI>
              <strong>Contractor profile:</strong> search for a sub you already have a profile for. Their stars show next to
              their name.
            </LI>
            <LI>
              <strong>No profile yet:</strong> type their name, company, email and phone. If they bid before, start typing
              their name or company and pick them from the list to fill in the rest. If the list says{" "}
              <strong>Has a profile, use it</strong>, pick it to log the bid on their profile instead.
            </LI>
          </UL>
          <Callout type="info">
            Fill in the sub&apos;s email when you have it. It&apos;s how their bids are kept together and matched to a profile
            later.
          </Callout>
        </Step>
        <Step n={3} title="3. Amount and what it covers">
          Type the bid amount and the day you got it. Under <strong>Covers</strong>, pick the SOV lines the bid is for, or
          leave it empty if it&apos;s for the whole job. The margin shows under it as you type.
        </Step>
        <Step n={4} title="4. Attach their proposal">
          Under <strong>Files</strong>, press <strong>Add files</strong> and pick their proposal, quote sheet or photos. PDF,
          image, Excel, Word or CSV, up to 4 MB each, as many as you need. Press <strong>Save</strong>; the files upload with
          the bid.
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
        <LI>
          A <strong>No profile</strong> tag means the sub doesn&apos;t have a profile yet. Subs with a profile show their
          Confidence (C) and Pricing (P) stars.
        </LI>
        <LI>Change the status right on the row: Received, Awarded, Declined or Withdrawn. Declined and withdrawn bids go gray.</LI>
        <LI>
          A bid&apos;s files show as paperclip links under the sub&apos;s name. Click one to open it (spreadsheets and Word
          files download). To add or remove files later, press <strong>Edit</strong> on the row.
        </LI>
        <LI>Use Edit or Delete on the row to fix a bid. Deleting a bid deletes its files too.</LI>
      </UL>
      <Callout type="info">
        Marking a bid <strong>Awarded</strong> doesn&apos;t add the sub to the job or change any costs. Add them on the{" "}
        <strong>Contractors</strong> tab as usual.
      </Callout>

      <H2>On the contractor&apos;s profile</H2>
      <P>
        Bids from a sub with a profile also show on their profile, on the <strong>Bids</strong> tab, with four numbers:
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
        Each bid&apos;s files show under the project name. Withdrawn bids are listed but left out of the averages. Click a
        project to open its Proposals tab and change a bid.
        The <strong>Contractors</strong> list shows each sub&apos;s <strong>Bids</strong> and <strong>Avg margin</strong> too.
      </P>

      <H2>Who can see it</H2>
      <P>Everyone who can see the project&apos;s Financials. Supervisors and employees can&apos;t.</P>
    </>
  );
}
