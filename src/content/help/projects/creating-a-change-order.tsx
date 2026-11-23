import { H2, P, Steps, Step, Img, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

export function CreatingAChangeOrder() {
  return (
    <>
        <H2>Overview</H2>
        <P>
          This guide walks you through creating and managing change orders in the ERP. Change orders document
          additional scope, cost, or schedule changes on a project. They&apos;re created from the project&apos;s own
          Change Orders tab.
        </P>
        <H2>Steps</H2>
        <Steps>
            <Step n={1} title="Open the project's Change Orders tab">
                Open the project from the Projects page and go to the <strong>Change Orders</strong> tab. On projects
                where subs have sent requests, it&apos;s a menu: pick <strong>Change orders</strong>.
                <Img src="/help/change_order/project_details_1.png" alt="Projects page" />
                <Img src="/help/change_order/project_details_2.png" alt="Project page tabs" />
            </Step>

            <Step n={2} title="Start the change order">
                Fill in <strong>Start change order</strong>: title, status, dates and pricing. For the usual janitorial
                ones, click <strong>UDR</strong>, <strong>Pool</strong> or <strong>Grill Cleaning</strong> under the title
                to fill it in. Pick who to notify under <strong>Notify employees</strong>; they get an email when it&apos;s
                created.
                <Img src="/help/change_order/new_project_4.png" alt="Change order email" />
            </Step>

            <Step n={3} title="Viewing your change order">
                Navigate to the change orders tab under your desired project.
                <Img src="/help/change_order/co_1.png" alt="Project details page" />
                A simple click on any of the grey area will drop down and allows you to quickly change the status of the order
                <Img src="/help/change_order/co_2.png" alt="Change order status" />
                <strong>Rejecting or voiding:</strong> picking <strong>Rejected</strong> or <strong>Void</strong> asks
                &ldquo;Why is it being rejected?&rdquo; and won&apos;t save without an answer. The reason shows under the
                change order&apos;s title and on its details page, with who wrote it and when. You can&apos;t create a change
                order that starts out rejected or void. When a property manager denies a sub&apos;s request, the change order is
                voided with their reason filled in for you.
                <br /><br />
                Click on the pink &ldquo;View Details&rdquo; text to view all details of the change order and add to it.
                <Img src="/help/change_order/co_3.png" alt="Change order details" />
                This will bring you to the details page 
                <Img src="/help/change_order/co_4.png" alt="Change order details" />
            </Step>


            <Step n={4} title="Details Page Overview">
                Below is an overview of the details tab. Click &ldquo;Save changes&rdquo; after edits, otherwise nothing will save.
                <Img src="/help/change_order/details_1.png" alt="Details tab" />
                Once labor has been logged against it, a <strong>Mark complete</strong> button appears here, and the start date auto-sets to the first day labor was logged. You can also finish a change order from its card on the Schedule with <strong>Mark whole change order complete</strong>, or mark just one of its days done with <strong>Mark day complete</strong>.
                <br /><br />
                Financials tab: this is where you update all estimated and actual costs. The actual cost of labor and materials is pulled from their corresponding logs.
                <Img src="/help/change_order/details_1.5.png" alt="Financials tab" />
                Labor tab: where you add <A href="/erp/help/workers/labor-logs">labor entries</A>.
                <Img src="/help/change_order/details_3.png" alt="Labor tab" />
                Labor table
                <Img src="/help/change_order/details_4.png" alt="Labor table" />
                Contractors tab: log contractors on the change order the same way you would on a project. See <A href="/erp/help/workers/logging-contractors">Assigning Contractors to Projects</A>.
                <ImgPlaceholder label="Contractors tab on a change order" size="sm" />
                Materials tab: this is where you update the <A href="/erp/help/projects/material-logs">material logs</A>.
                <Img src="/help/change_order/details_4.5.png" alt="Materials tab" />
                Safety Checklist tab: daily safety check history for the change order, same as a project&apos;s own Safety Checklist tab.
                <br /><br />
                Notify tab: email selected employees about this change order directly from here.
                <br /><br />
                Signing tab: for more on contracts, see the <A href="/erp/help/contracts/uploading-a-contract">Uploading a Contract</A> tutorial.
                <Img src="/help/change_order/details_5.png" alt="Signing tab" />
            </Step>

        </Steps>
    </>
  );
}
