import { Callout, H2, H3, P, UL, LI, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function ProjectsOverview() {
    return(
        <>
         <H2>Overview</H2>
        <P>
            This is an overview of the projects section of the ERP. We will go into detail on the projects table and filtering and projects details page.
        </P>
        <H2>Steps</H2>
        <Steps>
            <Step n={1} title="Projects Table">
                The first thing under the projects tab is the projects table. This table mimics the table from the previous PM dashboard with all the same informational columns.
                <Img src="/help/projects_overview/projects_overview_1.png" alt="Projects Table" />
                At the top we can see 5 different tabs which filter the projects by their segment.
                <Img src="/help/projects_overview/projects_overview_2.png" alt="Projects Table" />
                On the top right we have a search bar where we can search projects by their names
                <Img src="/help/projects_overview/projects_overview_3.png" alt="Projects Table" />
                We also have a status selector which filters projects by their lifecycle. The text of the project name corresponds to its status. The colors and corresponding lifecycle are shown below.
                <Img src="/help/projects_overview/projects_overview_4.png" alt="Projects Table" />
                Clicking on a projects row will bring down a drop down of the projects labor logs. For more on labor logs visit that labor logs tutorial.
                <br></br>
                You will also see a projects change orders here and click on that brings down its corresponding labor logs.
                <Img src="/help/projects_overview/projects_overview_5.png" alt="Projects Table" />
            </Step>
            <Step n={1} title="Projects Details">
                When you click on the title of a project it will bring you to the project details page.
                <br></br><br></br>
                You will land on the <strong>Details</strong> tab. On this tab you can create and edit <strong>work orders </strong> 
                which involve the projects name, address, start date, end date, service type, and main points of contact as well as any comments to the PM.
                <Img src="/help/projects_overview/details_1.png" alt="Projects Table" />
                Make sure after any edits you click save! You can then send work orders to employees in our system to inform them of projects and link them to the projects page. Please note if they do not have an ERP login they can only view the email.
                <Img src="/help/projects_overview/details_2.png" alt="Projects Table" />
                Next you can navigate to the <strong>Setup</strong> tab.
                <br></br><br></br>
                On this tab you can edit the projects lifecycle (upcoming, WIP, billing, and complete). You can also edit its segment, PM, start date, end date, and work type.
                <br></br><br></br>
                Make sure to save after any editing or it will not save!!
                <Img src="/help/projects_overview/details_3.png" alt="Projects Table" />
                Next you can navigate to the <strong>Money</strong> tab.
                <br></br><br></br>
                On this page you can edit contract value, the percent done, the percent invoiced, and the billing status.
                <br></br><br></br>
                You can also edit the estimated and actual costs on the project. The actual cost will be calculated based on the project labor logs and material costs.
                <Img src="/help/projects_overview/details_4.png" alt="Projects Table" />
                Next you can navigate to the <strong>Labor</strong> tab.
                <br></br><br></br>
                This is where you can log labor entries as well as view and sort your labor logs.
                For more information on labor entries view the corresponding userflow tutorial.
                <Img src="/help/projects_overview/details_5.png" alt="Projects Table" />
                Next we can navigate to the <strong>Contractors</strong> tab.
                <br></br><br></br>
                Here we can log contractors registered in our system. They follow a similar logging process to laborers.
                <Img src="/help/projects_overview/details_6.png" alt="Projects Table" />
                Next we can navigate to the <strong>Materials</strong> tab.
                <br></br><br></br>
                Here we can log materials registered in our system. They follow a similar logging process to laborers.
                <Img src="/help/projects_overview/details_7.png" alt="Projects Table" />
                Next we can navigate to the <strong>Checklist</strong> tab.
                <br></br><br></br>
                Here we can add items to a daily checklist. 
                <Callout type="warning">This feature is still a work in progress!!</Callout>
                <Img src="/help/projects_overview/details_8.png" alt="Projects Table" />
                Finally we can navigate to the <strong>Change Orders</strong> tab.
                <br></br><br></br>
                For more information on change orders view the <A href="/erp/help/projects/creating-a-change-order">change orders</A> tutorial page.
                <br></br><br></br>
                <strong>Thats all! For any more information check out the other help center articles or message the tech dev team!</strong>
            </Step>
        </Steps>
        </>
    )
}