import { Callout, H2, P, Steps, Step, Img, A, UL, LI } from "@/app/erp/components/help/HelpComponents";

export function AddingContractors() {
    return(
        <>
        <H2>Overview</H2>
        <P>
          Contractors are external workers assigned to projects. Each contractor has a profile where you can manage their general info, required documents, an informational intake form, and contract signing. This guide covers how to create a contractor and navigate their profile.
        </P>
        <H2>Steps</H2>
        <Steps>
            <Step n={1} title="Navigate to the contractor page">
                First you must navigate to the <strong>Contractor Verification</strong> tab.
                <Img src="/help/add_contractor/contractor_1.png" alt="Contractor" />
                To add a new contractor click the add contractor button which will bring up a input for their name and email.
                <Img src="/help/add_contractor/contractor_2.png" alt="Contractor" />
                Hit <strong>Save contractor</strong> and congrats! You created your first contractor!
            </Step>

            <Step n={2} title="Contractor Details">
                Click on the name of a contracroe in the table will bring you to the contractor details page.
                <br></br><br></br>
                Sections start collapsed, with a status line on each; only the most urgent problem opens on its own.
                <br></br><br></br>
                The profile has five tabs: <strong>Overview</strong> (name, email, status, application and company profile), <strong>Compliance</strong> (insurance, background check, documents, licensing), <strong>Pay &amp; Personal</strong> (info form link, personal info, bank, SSN), <strong>Work</strong> (labor and time off), and <strong>Signing</strong>.
                <br></br><br></br>
                On <strong>Overview</strong>, open <strong>General information</strong> to edit their name, email, and status (active or inactive). There&apos;s also a <strong>Delete contractor</strong> button there if you need to remove one entirely.
                <Img src="/help/add_contractor/contractor_3.png" alt="Contractor" />
                Under <strong>Compliance → Documents</strong> you set which documents a contractor must provide. Click <strong>Edit list</strong> to add or remove documents.
                <Img src="/help/add_contractor/contractor_4.png" alt="Contractor" />
                <Callout type="warning">
                    Click <strong>Save list</strong> first. The upload/replace button for
                    each document only appears after the list itself has been saved.
                </Callout>
                Once a document is added and requirements are saved, you can either upload it yourself or send a single upload link covering everything outstanding via email to the contractor.
                <Img src="/help/add_contractor/contractor_5.jpg" alt="Contractor" />
                Under <strong>Pay &amp; Personal</strong> is the informational form where we can gather information directly from the contractor, including their SSN, banking details, and insurance status.
                <Img src="/help/add_contractor/contractor_6.png" alt="Contractor" />
                You can also manually input this information if needed. Sending it to the contractor uses the same kind of secure, no-login link as the documents step, expiring after 7 days.
                <br></br><br></br>
                Here is an example of what the form sent to the contractor looks like.
                <Img src="/help/add_contractor/contractor_7.png" alt="Contractor" />
                Finally is the contract signing tab. For more information on contract signing navigate to the <A href="/erp/help/contracts/uploading-a-contract">Uploading a Contract</A> help page.
                <Img src="/help/add_contractor/contractor_8.png" alt="Contractor" />
                <strong>Thats all! For any more information check out the other help center articles or message the tech dev team!</strong>
            </Step>
            <Step n={3} title="Insurance">
                On the <strong>Compliance</strong> tab, <strong>Insurance &amp; Workers Comp</strong> tracks the
                sub&apos;s certificate of insurance (COI).
                It opens as a short summary; click <strong>Edit</strong> to change it.
                <UL>
                    <LI>
                        Enter <strong>general liability</strong> and <strong>workers&apos; comp</strong> (carrier, policy number,
                        limits, expiration), plus auto and umbrella if they have them. Subs can fill in general liability and
                        workers&apos; comp themselves through the information form link.
                    </LI>
                    <LI>
                        Check <strong>Exempt</strong> for a solo sub with no employees and no workers&apos; comp policy, and upload
                        their exemption form under Documents.
                    </LI>
                    <LI>
                        <strong>Sueep on their certificate</strong>: record whether their COI lists Sueep as additional insured, with
                        waiver of subrogation and primary and noncontributory.
                    </LI>
                    <LI>
                        Attach their certificate at the bottom of the form under <strong>Certificate of insurance</strong>. It
                        uploads right away; <strong>Replace</strong> swaps in a newer one.
                    </LI>
                    <LI>
                        Check <strong>I checked their certificate</strong> when saving to record who reviewed it and when.
                    </LI>
                </UL>
                The status at the top (<strong>Valid</strong>, <strong>Expiring</strong>, <strong>Expired</strong>, or{" "}
                <strong>Missing</strong>) also shows in the Insurance column on the Contractors list. General liability and
                workers&apos; comp (or an exemption) are always required; auto and umbrella count once a date is entered.
                <br></br><br></br>
                Subs must carry the insurance the GC requires on the job. A job&apos;s requirements come from the Certificate
                Holders and COI requests on that project (see Insurance &amp; COIs). On the project&apos;s{" "}
                <strong>Contractors</strong> tab, <strong>Subs need</strong> shows them, and a <strong>Below job insurance</strong>{" "}
                tag marks any sub who falls short. The sub&apos;s Insurance section lists the open jobs where they&apos;re below
                what the GC requires.
                When scheduling a sub on the calendar or adding them to a project, their name shows{" "}
                <strong>No workers&apos; comp</strong> or <strong>WC expired</strong> if they don&apos;t have current workers&apos;
                comp (and aren&apos;t exempt). It&apos;s a warning only for now; they can still be scheduled.
                <Callout type="info">
                    The dashboard&apos;s <strong>Sub insurance alerts</strong> lists subs whose workers&apos; comp is missing,
                    expired, or expiring within 30 days, and whose general liability is expired or expiring.
                </Callout>
            </Step>
        </Steps>
        </>
    )
}
