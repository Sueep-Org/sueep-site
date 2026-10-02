import { Callout, H2, H3, P, UL, LI, Steps, Step, A, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function CoiQuickStart() {
  return (
    <>
      <H2>What a COI is</H2>
      <P>
        A <strong>certificate of insurance (COI)</strong> is a one-page PDF that proves Sueep has insurance. GCs and property
        managers want one before we work on their building, and many won&apos;t pay our invoice until they have a current one.
        We make COIs in <strong>CoverDash</strong>; the ERP keeps track of who asked for one, what they need on it, and when it
        runs out.
      </P>
      <P>Day to day, your job comes down to three things:</P>
      <UL>
        <LI>When a GC asks for a COI, make it and send it (below).</LI>
        <LI>When a COI is about to run out, send a new one before they ask.</LI>
        <LI>When we hire a subcontractor, get their COI on file.</LI>
      </UL>

      <H2>A GC asks for a COI: 5 steps</H2>
      <Steps>
        <Step n={1} title="1. Send them the request link">
          Open the project, go to the <strong>COIs</strong> tab, and click <strong>Request link</strong>. Under{" "}
          <strong>Email it</strong>, pick their name (or type their email) and click <strong>Send</strong>. They fill in who the
          COI is for and what it needs, so you don&apos;t have to chase details. They can reuse the same link for every COI on
          that project.
          <Callout type="tip">
            If they already emailed everything you need, you can skip the link and go straight to step 3.
          </Callout>
        </Step>

        <Step n={2} title="2. Open the request">
          New requests show in the <strong>COIs</strong> box on the dashboard, on <strong>Insurance &amp; COIs → Requests</strong>,
          and at the top of the project&apos;s COIs tab (and by email, if it&apos;s set up). Read it over:
          <UL>
            <LI>
              If a company shows <strong>Save to holders</strong>, click it. That saves them for next time.
            </LI>
            <LI>
              If you see a red <strong>Gap</strong> anywhere, stop. It means our insurance doesn&apos;t cover what they asked
              for. Send it to the broker (see &quot;When to ask for help&quot; below) instead of making the COI.
            </LI>
          </UL>
        </Step>

        <Step n={3} title="3. Make the COI in CoverDash">
          Click <strong>Add COI</strong> on the request. The <strong>For CoverDash</strong> box shows exactly what to type: the
          company name, address, who to list as additional insured, and any special wording. In CoverDash, go to{" "}
          <strong>Certificates → New Certificate</strong>, copy those in, and download the PDF.
          <Callout type="warning">
            If CoverDash says the certificate is <strong>pending review</strong>, close the Add COI form and click{" "}
            <strong>Sent to broker</strong> on the request. Come back to this step when CoverDash finishes it.
          </Callout>
        </Step>

        <Step n={4} title="4. Send the PDF to the GC">
          Email it to whoever asked, or upload it to their vendor portal if they use one (for example RealPage or NetVendor).
          The request shows who asked and their email.
        </Step>

        <Step n={5} title="5. Save it in the ERP">
          Back in the Add COI form: the policies are already checked (make sure they match the PDF), keep the date, attach the
          PDF, and check <strong>Already sent</strong>. Click <strong>Save</strong>. The request closes on its own once every
          company on it has a COI.
        </Step>
      </Steps>

      <H2>Keeping COIs current</H2>
      <UL>
        <LI>
          <strong>Check the dashboard&apos;s COIs box once a week.</strong> It lists COIs that are expired or run out within 30
          days on jobs that aren&apos;t fully paid. For each one, make a new COI in CoverDash, open the project&apos;s COIs tab,
          click the old COI, click <strong>New version</strong>, attach the new PDF, and send it.
        </LI>
        <LI>
          <strong>When our insurance renews</strong> (most policies in May and June; auto every 6 months), an admin updates the
          dates on <strong>Insurance &amp; COIs → Our Policies</strong>. Then open the <strong>Renewals</strong> tab and click{" "}
          <strong>New version</strong> on each row. CoverDash often makes the new PDFs for you after a renewal.
        </LI>
        <LI>
          An expired COI also shows as a red pill under the project name and on Project Billing, as a reminder before
          invoicing.
        </LI>
      </UL>

      <H2>Subcontractors</H2>
      <P>
        Subs have to carry the same insurance the GC asks us for on that job. When a sub starts with us, or sends a new
        certificate:
      </P>
      <UL>
        <LI>
          Open the contractor, go to <strong>Compliance → Insurance &amp; Workers Comp</strong>, and click{" "}
          <strong>Edit</strong>.
        </LI>
        <LI>
          Copy the general liability and workers&apos; comp details from their certificate (carrier, limits, expiration). If
          they&apos;re a one-person company with no workers&apos; comp, check <strong>Exempt</strong> and upload their exemption
          form under Documents.
        </LI>
        <LI>
          Under <strong>Sueep on their certificate</strong>, mark what their certificate shows for Sueep. Attach the certificate
          at the bottom, check <strong>I checked their certificate</strong>, and save.
        </LI>
      </UL>
      <P>Two warnings to watch for:</P>
      <UL>
        <LI>
          <strong>No workers&apos; comp</strong> or <strong>WC expired</strong> next to a sub&apos;s name when scheduling. You can
          still schedule them for now, but get their new certificate first.
        </LI>
        <LI>
          <strong>Below job insurance</strong> on a project&apos;s Contractors tab: the GC requires more than this sub has. Ask
          the sub for a certificate with higher limits.
        </LI>
      </UL>

      <H2>Insurance words, in plain English</H2>
      <Table>
        <THead>
          <tr>
            <TH>Word</TH>
            <TH>What it means</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Certificate holder</TD>
            <TD>The company we&apos;re giving the COI to. Their name goes in the box at the bottom.</TD>
          </tr>
          <tr>
            <TD>Additional insured (AI)</TD>
            <TD>Our insurance also protects them if they get blamed for something our work caused.</TD>
          </tr>
          <tr>
            <TD>Waiver of subrogation</TD>
            <TD>Our insurance company agrees not to sue them to get back money it paid on a claim.</TD>
          </tr>
          <tr>
            <TD>Primary and noncontributory (P&amp;NC)</TD>
            <TD>If there&apos;s a claim, our insurance pays first and theirs doesn&apos;t have to chip in.</TD>
          </tr>
          <tr>
            <TD>Each occurrence</TD>
            <TD>The most the insurance pays for one incident, for example $1M.</TD>
          </tr>
          <tr>
            <TD>Aggregate</TD>
            <TD>The most it pays in total for the whole policy year, for example $2M.</TD>
          </tr>
          <tr>
            <TD>Umbrella</TD>
            <TD>Extra coverage that kicks in after general liability runs out. Ours adds $2M, so we can show up to $3M.</TD>
          </tr>
          <tr>
            <TD>Workers&apos; comp</TD>
            <TD>Pays for a worker&apos;s medical bills and lost wages if they get hurt on the job.</TD>
          </tr>
        </tbody>
      </Table>

      <H2>Cheat sheet</H2>
      <Table>
        <THead>
          <tr>
            <TH>If this happens</TH>
            <TH>Do this</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>A GC emails asking for a COI</TD>
            <TD>Send them the request link from the project&apos;s COIs tab (step 1).</TD>
          </tr>
          <tr>
            <TD>A new request shows up</TD>
            <TD>Steps 2 to 5: check for gaps, make it in CoverDash, send it, save it.</TD>
          </tr>
          <tr>
            <TD>A red Gap shows on a request or holder</TD>
            <TD>Don&apos;t make the COI. Send the request to the broker.</TD>
          </tr>
          <tr>
            <TD>CoverDash says pending review</TD>
            <TD>Click Sent to broker on the request and wait.</TD>
          </tr>
          <tr>
            <TD>The dashboard shows a COI expiring</TD>
            <TD>Make a new one in CoverDash, then New version on the project&apos;s COIs tab.</TD>
          </tr>
          <tr>
            <TD>A GC says they won&apos;t pay until they get a COI</TD>
            <TD>Check the project&apos;s COIs tab. If it&apos;s expired, send a new version right away.</TD>
          </tr>
          <tr>
            <TD>A sub shows No workers&apos; comp</TD>
            <TD>Ask them for their current certificate and enter it on their profile.</TD>
          </tr>
          <tr>
            <TD>Our policies renewed</TD>
            <TD>Admin updates the dates on Our Policies, then work through the Renewals tab.</TD>
          </tr>
        </tbody>
      </Table>

      <H2>When to ask for help</H2>
      <P>Go to the insurance broker (through CoverDash) or your manager when:</P>
      <UL>
        <LI>A request or holder shows a red Gap.</LI>
        <LI>CoverDash puts a certificate in pending review for more than a couple of days.</LI>
        <LI>A GC asks for more than $3M, or for something you don&apos;t see in our policies.</LI>
        <LI>Anything on a certificate doesn&apos;t match what the GC asked for and you&apos;re not sure why.</LI>
      </UL>

      <H3>More detail</H3>
      <P>
        For every screen and button, see <A href="/erp/help/insurance/insurance-overview">Insurance &amp; COIs</A>. For
        subcontractor profiles, see <A href="/erp/help/workers/adding-contractors">Adding Contractors</A>.
      </P>
    </>
  );
}
