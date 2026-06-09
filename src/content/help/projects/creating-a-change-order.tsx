import { H2, P, Steps, Step, Img, SkipTo, A } from "@/app/erp/components/help/HelpComponents";

export function CreatingAChangeOrder() {
  return (
    <>
        <H2>Overview</H2>
        <P>
          This guide walks you through creating and managing change orders in the ERP. 
          Change orders are used to document additional scope, cost, or schedule adjustments on a post-construction project.
           There are two ways to create one: from the New Project button or directly from a project&apos;s details page.
            This tutorial covers both methods as well as how to view, update, and navigate the change order details page.
        </P>
        <H2>Steps</H2>
        <Steps>
            <Step n={1} title="Go to Project">
            Navigate to the projects tab. It is the first tab under the Project Information drop down.
            </Step>

            <Step n={2} title="Methods of Creating a Change Order">
                There are 2 ways we can create a change order:
                <ol className="mt-3 mb-3 space-y-1.5 pl-5 text-sm text-gray-700 list-decimal">
                    <li>Via the <SkipTo href="#NewProject">&ldquo;New Project&rdquo;</SkipTo> button</li>
                    <li>Via <SkipTo href="#ProjectDetails">Project Details</SkipTo></li>
                </ol>
                We will go over both. They do the same thing where you chose to create it is based on preference.
            </Step>

            <div id= "NewProject">
            <Step n={3} title="Via the New Project Button">
                Click on the New Project button from the projects page.
                <Img src="/help/change_order/new_project_1.png" alt="New Project Button" />
                Under &ldquo;Segment&rdquo; select change order
                <Img src="/help/change_order/new_project_2.png" alt="New Projects form" />
                Fill out your change order information
                <Img src="/help/change_order/new_project_3.png" alt="Change Order form" />
                Upon creation this is the email notification your chosen recipient (default Sergio and David) will get.
                <Img src="/help/change_order/new_project_4.png" alt="Email" />
            </Step>
            </div>

            <div id ="ProjectDetails">
            <Step n={4} title="Via the Project Details page">
                Navigate to the Projects tab and click on your desired project.
                <Img src="/help/change_order/project_details_1.png" alt="Projects Tab" />
                Navigate to the &ldquo;Change Orders&rdquo; tab
                <Img src="/help/change_order/project_details_2.png" alt="Project details page" />

            </Step>
            </div>

            <Step n={5} title="Viewing your change order">
                Navigate to the change orders tab under your desired project.
                <Img src="/help/change_order/co_1.png" alt="Project details page" />
                A simple click on any of the grey area will drop down and allows you to quickly change the status of the order
                <Img src="/help/change_order/co_2.png" alt="Change order status" />
                Click on the pink &ldquo;View Details&rdquo; text to view all details of the change order and add to it.
                <Img src="/help/change_order/co_3.png" alt="Change order details" />
                This will bring you to the details page 
                <Img src="/help/change_order/co_4.png" alt="Change order details" />
            </Step>


            <Step n={6} title="Details Page Overview">
                Below is an overview of the details tab. Click “Save Changes” after edits, otherwise nothing will save.
                <Img src="/help/change_order/details_1.png" alt="Details Tab" />       
                Costs Tab: This is where you can updated all estimated and actual costs. The actual cost of labor and materials is pulled from their corresponding logs.
                <Img src="/help/change_order/details_1.5.png" alt="Details Tab" />       
                Billing tab
                <Img src="/help/change_order/details_2.png" alt="Billing tab" />
                Laborers tab: Where you can add <A href="/erp/help/workers/labor-logs">labor entries</A>
                <Img src="/help/change_order/details_3.png" alt="laborers tab" />
                Laborers table
                <Img src="/help/change_order/details_4.png" alt="labor table" />
                Materials tab: This is where yoy can update the <A href="/erp/help/projects/material-logs">material logs</A>.
                <Img src="/help/change_order/details_4.5.png" alt="labor table" />
                Contracts tab: for more on contracts navigate to <A href="/erp/help/contracts/uploading-a-contract">Contract Signing</A> tutorial
                <Img src="/help/change_order/details_5.png" alt="contracts tab" />
                <strong>Thats all! For any more information check out the other help center articles or message the tech dev team!</strong>

            </Step>
        </Steps>
    </>
  );
}
