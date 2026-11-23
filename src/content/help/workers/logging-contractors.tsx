import { H2, P, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function LoggingContractors() {
    return(
        <>
         <H2>Overview</H2>
        <P>
            Contractor logs track which contractors worked on a project, their role, cost and dates. They&apos;re added from the project&apos;s page and can be edited or removed at any time.
        </P>
        <Steps>
            <Step n={1} title="Open the project's Contractors tab">
                The contractor has to be <A href="/erp/help/workers/adding-contractors">added to the ERP</A> first.
                <br></br><br></br>
                Open the project from the Projects page. In the tab bar, open the <strong>Labor</strong> menu and pick <strong>Contractors</strong>.
                <Img src="/help/log_contractors/contractor_logs_1.png" alt="Project Contractors tab" />
            </Step>

            <Step n={2} title="Add the contractor">
                Under <strong>Add contractor</strong>, pick the contractor and fill in their role, cost, start and end dates. If the project has Schedule of Values items, tick the ones this contractor worked on. Otherwise type the task.
                <br></br><br></br>
                Click <strong>Add contractor</strong>. The entry shows in the table below, where it can be edited or deleted.
                <Img src="/help/log_contractors/contractor_logs_2.png" alt="Contractor log table" />
            </Step>
        </Steps>
        </>
    )
}
