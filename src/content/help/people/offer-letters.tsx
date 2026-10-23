import { Callout, H2, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function OfferLetters() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Offer letters for office hires are made in the ERP from a template. The candidate&apos;s name, job title and
        dates fill in for you, commission tables are worked out from a few numbers, and the letter is emailed as a PDF.
        When the signed copy comes back, upload it and the candidate moves to Hired.
      </P>

      <H2>Templates</H2>
      <P>
        Open <strong>Recruitment</strong>, the <strong>Office</strong> tab, then <strong>Offer templates</strong>. Admins
        and the Business Manager can edit templates. PMs can see them and use them for letters.
      </P>
      <UL>
        <LI>
          <strong>Standard</strong> and <strong>With commission</strong> come from the letters we used before. Click{" "}
          <strong>Add starter templates</strong> on an empty page to bring them in.
        </LI>
        <LI>
          Edit right on the letter: click and type. Use <strong>B</strong> for bold and <strong>• List</strong> for
          bullets. Enter starts a new paragraph, Shift+Enter a new line.
        </LI>
        <LI>
          <strong>Pink pills are blanks</strong>, like Start date or First name. They fill in for each candidate. Add one
          with <strong>+ Insert blank</strong>.
        </LI>
        <LI>
          Hover a section to move it, add a heading, <strong>Hide</strong> it (left out of letters, kept in the
          template) or <strong>Remove</strong> it.
        </LI>
        <LI>
          On the With commission template, click <strong>Edit numbers</strong> under the tables to set the commission
          rate, assumed margin, ladder range, accelerators, margin tiers and the example.
        </LI>
        <LI>
          Use <strong>Duplicate</strong> to start a new template from an old one. A template that was used for a letter
          can be archived but not deleted.
        </LI>
      </UL>
      <Callout type="info">
        The <strong>Signature</strong> card at the top holds Edwin&apos;s signature image. It&apos;s added to his line
        when a letter is sent, only on templates signed by that same name.
      </Callout>

      <H2>Making and sending a letter</H2>
      <Steps>
        <Step n={1} title="Start the letter">
          Open the candidate, go to the <strong>Offer</strong> tab and click <strong>Make offer letter</strong>. On an
          opening&apos;s board, the card&apos;s <strong>⋯</strong> menu has it too when the candidate is in Final round,
          Offer or Backup.
        </Step>

        <Step n={2} title="Fill it in">
          Pick a template. Name, job title, office address, letter date and a sign-by date two business days out are
          filled in already. Fill in the rest, like salary and start date. Empty boxes are highlighted. The{" "}
          <strong>i</strong> next to Salary shows the opening&apos;s range and what the candidate said they expect.
          <P>
            Untick a section to leave it out of this letter only. For commission letters, the <strong>Commission</strong>{" "}
            box changes the numbers for this person. The preview on the right is the real PDF and updates as you type.
          </P>
        </Step>

        <Step n={3} title="Save the draft">
          Click <strong>Save draft</strong>. Drafts can be opened and changed again from the Offer tab. A draft keeps the
          wording it was made with, so later template edits don&apos;t change it.
        </Step>

        <Step n={4} title="Send it">
          Click <strong>Send…</strong> and choose <strong>Email it with the PDF attached</strong> (you get a copy and
          replies come to you) or <strong>I sent it another way</strong>. It won&apos;t send until every blank is filled.
          Sending locks the PDF and moves the candidate to <strong>Offer</strong>.
        </Step>

        <Step n={5} title="When they answer">
          <UL>
            <LI>
              <strong>Upload signed copy:</strong> the letter turns Signed and the candidate moves to{" "}
              <strong>Hired</strong>, which opens onboarding. The signed file also shows in the Signing tab and moves to
              their employee profile.
            </LI>
            <LI>
              <strong>Mark declined:</strong> the candidate moves to <strong>Withdrew</strong>.
            </LI>
            <LI>
              <strong>Void:</strong> for a letter with a mistake. It stays on file marked Void. Make a new one.
            </LI>
          </UL>
        </Step>
      </Steps>

      <H2>Keeping track</H2>
      <UL>
        <LI>
          Board cards show one offer flag: draft, sent, due tomorrow or today, overdue, signed or declined. Hover it for
          the dates.
        </LI>
        <LI>
          The morning before a letter is due back, whoever sent it gets a reminder email if it isn&apos;t signed yet. It
          shows in their inbox too.
        </LI>
      </UL>
      <Callout type="tip">
        The offer email and the reminder are on the Notifications page under People and Reminders, if you want to add a
        Cc or turn one off.
      </Callout>
    </>
  );
}
