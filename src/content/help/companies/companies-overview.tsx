import { Callout, H2, H3, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function CompaniesOverview() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        <strong>Companies</strong> (left menu, under Projects) lists the property managers, general contractors and owners
        we work with, and how each one wants to be billed: by email, a RealPage inbox, Procore, Coupa or a vendor portal.
      </P>
      <UL>
        <LI>Admins, Project Managers, the Business Manager, and Sales can see companies and pick one on a building or project.</LI>
        <LI>Only Admins and the Business Manager can edit a company, its contacts and billing, and billing overrides.</LI>
        <LI>
          Portal logins (Procore, Coupa...) are saved once on Company Info &gt; Logins and linked to each company that uses them.
          Anyone who can open Company Info can reveal them. Every Reveal and Copy is logged.
        </LI>
      </UL>

      <H2>Adding a company</H2>
      <Steps>
        <Step n={1} title="Name and type">
          Click <strong>+ New company</strong>, enter the name and pick a type.
        </Step>
        <Step n={2} title="Other names">
          Add other spellings people use, like JAG for Jefferson Apartment Group. Search finds the company under any of them.
        </Step>
        <Step n={3} title="Billing">
          Method, send to, cc, cutoff day, how often and payment terms.
        </Step>
        <Step n={4} title="Contacts and logins">
          On the company page, add contacts. If they use a portal, save the login on Company Info &gt; Logins first, then use{" "}
          <strong>Link a login from Company Info</strong>. One Procore login can be linked to every GC that uses it.
        </Step>
      </Steps>
      <Callout type="warning">Never put passwords in Billing instructions or Notes. Those are not encrypted. Save them on Company Info &gt; Logins.</Callout>

      <H2>Buildings and projects</H2>
      <P>
        On a building&apos;s Details tab, <strong>Client &amp; billing</strong> sets who manages it and, optionally, who owns
        it. When the managing company changes, pick the new one and the date it took over. The old company stays in{" "}
        <strong>Past management</strong> with an end date.
      </P>
      <P>
        A project bills the building&apos;s managing company unless you pick a different <strong>Client company</strong> on its
        Overview tab, for example a GC on a post-construction job.
      </P>
      <P>
        For a general contractor, add their post-construction jobs from the company page: in <strong>Projects</strong>, use{" "}
        <strong>Add a post-construction project</strong> and type the job or the GC&apos;s name. <strong>Remove</strong> takes
        the job off without changing anything else on it.
      </P>

      <H3>Where invoices go</H3>
      <P>
        <strong>Invoices go to</strong> shows the answer and where each line came from. The most specific setting wins:
      </P>
      <UL>
        <LI>The project&apos;s billing override, then</LI>
        <LI>the building&apos;s billing override, then</LI>
        <LI>the client company&apos;s billing profile.</LI>
      </UL>
      <P>
        Use an override only for what&apos;s different. For example, J Centra has its own billing email, so the J Centra
        building overrides <strong>Send to</strong> and keeps JAG&apos;s cc and everything else.
      </P>
    </>
  );
}
