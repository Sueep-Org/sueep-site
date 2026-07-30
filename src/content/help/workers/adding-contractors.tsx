import { Callout, H2, P, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

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
                You will land on the <strong>General Info Tab</strong> here you can edit their name, email, and status (active or inactive). There&apos;s also a <strong>Delete contractor</strong> button here if you need to remove one entirely.
                <Img src="/help/add_contractor/contractor_3.png" alt="Contractor" />
                Next is the documents tab where you can set required documents for contractors.
                <Img src="/help/add_contractor/contractor_4.png" alt="Contractor" />
                <Callout type="warning">
                    Click <strong>Save requirements</strong> first. The upload/replace button for
                    each document only appears after the requirement list itself has been saved.
                </Callout>
                Once a document is added and requirements are saved, you can either upload it yourself or send a single upload link covering everything outstanding via email to the contractor.
                <Img src="/help/add_contractor/contractor_5.jpg" alt="Contractor" />
                Next is the informational form where we can gather information directly from the contractor, including their SSN, banking details, and insurance status.
                <Img src="/help/add_contractor/contractor_6.png" alt="Contractor" />
                You can also manually input this information if needed. Sending it to the contractor uses the same kind of secure, no-login link as the documents step, expiring after 7 days.
                <br></br><br></br>
                Here is an example of what the form sent to the contractor looks like.
                <Img src="/help/add_contractor/contractor_7.png" alt="Contractor" />
                Finally is the contract signing tab. For more information on contract signing navigate to the <A href="/erp/help/contracts/uploading-a-contract">Uploading a Contract</A> help page.
                <Img src="/help/add_contractor/contractor_8.png" alt="Contractor" />
                <strong>Thats all! For any more information check out the other help center articles or message the tech dev team!</strong>
            </Step>
        </Steps>
        </>
    )
}
