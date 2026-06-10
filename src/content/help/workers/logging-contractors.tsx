import { Callout, H2, H3, P, UL, LI, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function LoggingContractors() {
    return(
        <>
         <H2>Overview</H2>
        <P>
            Contractor logs let you track which contractors worked on a project, their role, cost, and dates. Logs are added directly from the project detail page and can be edited or removed at any time.
        </P>
        <Steps>
            <Step n={1} title="Navigating to Contractors">
                To log a contractors work you must first have them <A href="/erp/help/workers/adding-contractors">registered</A>. 
                <br></br><br></br>
                Then you can navigate to the desired project and click on the title to open up the details page. From there navigate to the <strong>contractors</strong> tab.
                <Img src="/help/log_contractors/contractor_logs_1.png" alt="Contractor" />
            </Step>

            <Step n={2} title="Enter their information">
                From the <strong>Contractors</strong> tab you can add information to their log such as role, cost, start and end dates, and any extra notes.
                <br></br><br></br>
                Once entered this information will appear in the contractors table right below the entry box.
                <Img src="/help/log_contractors/contractor_logs_2.png" alt="Contractor" />
                Once information is entered it can still be edited or deleted.
                <br></br><br></br>
                <strong>Thats all! For any more information check out the other help center articles or message the tech dev team!</strong>
            </Step>
        </Steps>
        </>
    )
}