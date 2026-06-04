import { Callout, H2, H3, P, UL, LI, Steps, Step, Img } from "@/app/erp/components/help/HelpComponents";

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
                WIP
            </Step>
        </Steps>
        </>
    )
}