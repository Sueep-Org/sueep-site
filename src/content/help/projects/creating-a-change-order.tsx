import { H2, P, Steps, Step, Img, SkipTo } from "@/app/erp/components/help/HelpComponents";

export function CreatingAChangeOrder() {
  return (
    <>
        <H2>Overview</H2>
        <P>Testing</P>
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
        </Steps>

    

    </>
  );
}
