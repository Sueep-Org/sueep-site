import { Callout, H2, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function CompanyInfoOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Company Info (<strong>ERP → Company Info</strong>) is the one place for Sueep&apos;s own details: tax IDs, licenses,
        certifications, banking, financial statements, and the logins to the websites we use. It replaces the
        &quot;General information&quot; Google Sheet. Only Admins and PMs can see it.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="General tab">
          Cards of company details: Company, Owners, Federal IDs, State and city IDs, Licenses and registrations, Certifications
          and safety, Industry codes, What we do, and Documents and insurance. Use the search box to find a row by name, value, or
          comment.
          <UL>
            <LI>
              Hover a row for <strong>Copy</strong> and <strong>Edit</strong>. Click <strong>+ Add</strong> on a card for a new row.
            </LI>
            <LI>
              <strong>Comment</strong> shows behind the <strong>i</strong> icon next to the row name.
            </LI>
            <LI>
              <strong>Expires</strong> is for licenses, registrations, and certifications. A badge shows the days left once
              it&apos;s within 30 days, or <strong>Expired</strong>. The strip at the top counts what needs attention.
            </LI>
            <LI>
              For a second NAICS code, owner, or anything else that repeats, open the row and click{" "}
              <strong>Add another</strong>.
            </LI>
            <LI>A value that starts with https:// or www. becomes a clickable link.</LI>
          </UL>
        </Step>

        <Step n={2} title="Locked values">
          Rows with a lock icon are encrypted: the EIN, PHL TIN, NJ Tax ID, routing number, and checking account to start. To
          lock any other row, edit it and check <strong>Encrypt and hide this value</strong>.
          <UL>
            <LI>
              They show as dots with the last 4 characters. <strong>Reveal</strong> shows the full value for 30 seconds.{" "}
              <strong>Copy</strong> copies it without showing it.
            </LI>
            <LI>
              When editing a locked row, leave the value blank to keep what&apos;s saved, or type a new one to replace it.
            </LI>
            <LI>Every Reveal and Copy is recorded with who did it and when (see step 5).</LI>
          </UL>
        </Step>

        <Step n={3} title="Financial tab">
          <UL>
            <LI>
              <strong>Company size</strong> and <strong>Banking</strong> work like the General tab cards.
            </LI>
            <LI>
              <strong>By year</strong>: annual volume plus that year&apos;s P&amp;L and balance sheet. Click{" "}
              <strong>+ Add year</strong> for a new year, or <strong>Edit</strong> on a row to change the volume. Under P&amp;L or
              Balance sheet, click <strong>+ Add</strong> to upload the file or paste a Google Drive link. Adding a new one
              replaces that year&apos;s old one.
            </LI>
            <LI>
              <strong>Documents</strong>: the W9 and any other paperwork not tied to a year.
            </LI>
            <LI>Files can be PDF, image, Excel, Word, or CSV, up to 4 MB. For bigger files, paste a Drive link.</LI>
          </UL>
        </Step>

        <Step n={4} title="Logins tab">
          Website logins for the company. Click <strong>+ Add login</strong>, or <strong>Edit</strong> on a row.
          <UL>
            <LI>
              Passwords are encrypted. <strong>Reveal</strong> shows one for 30 seconds, and <strong>Copy</strong> copies it.
              Both are recorded.
            </LI>
            <LI>
              <strong>Generate a strong one</strong> makes a random 20 character password. Save it here first, then change it
              on the website.
            </LI>
            <LI>Leave the password blank when editing to keep the saved one.</LI>
          </UL>
          <Callout type="warning">
            Notes are not encrypted. Keep passwords and security answers in the Password field only.
          </Callout>
        </Step>

        <Step n={5} title="Access log (Admins only)">
          Lists every Reveal and Copy across Company Info, newest first: who, when, which value, and whether it was viewed or
          copied. Search by person or item.
        </Step>

        <Step n={6} title="Expiration reminders">
          Every expiration date on Company Info shows on <strong>Schedule → Management</strong> under{" "}
          <strong>Company licenses and IDs</strong>, with reminder emails 30 and 7 days before. Change the reminder days in that
          calendar&apos;s categories.
        </Step>
      </Steps>
    </>
  );
}
