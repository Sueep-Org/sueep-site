import { Callout, Steps, Step, H2, P, Img, A } from "@/app/erp/components/help/HelpComponents";

export function CreatingAProject() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Projects can be created manually or synced automatically from HubSpot deals. 
        This guide covers manual creation.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Go to New Project">
          Click <strong>New Project</strong> in the left sidebar under Project Information or at the top of the projects table.
           <Img src="/help/projects/projects_1.png" alt="New Projects form locations" />

        </Step>
        <Step n={2} title="Creating your project manually">
          Once you click new project this page will come up called the new project form.
          <Img src="/help/projects/projects_2.png" alt="New Projects form locations" />
          From here you can create commercial painting, cleaning, residential painting, change orders, and janitorial turnover requests.
          <br></br>
          For information on <A href="/erp/help/projects/creating-a-change-order">change</A> orders or <A href="/erp/help/turnover/creating-a-request">janitorial turnover requests</A> visit their seperate tutorials. 
          <br></br>
          The creation for create commercial painting, cleaning, and residential painting
          will be covered here as those 3 all follow the same creation process as well as views.
          <Img src="/help/projects/projects_3.png" alt="New Projects form locations" />
          Once you chose your segment you can enter your start and end date. This is all editable later so you do not have to enter it to start.
          <br></br>
          You can also chose your job title from the list of current projects.
          <Img src="/help/projects/projects_4.png" alt="New Projects form locations" />
          If you want to create a new project manually unrelated to any current project choose other and type in the name.
          <Img src="/help/projects/projects_6.png" alt="New Projects form locations" />
          You can then chose the work that will be done.
          <Img src="/help/projects/projects_7.png" alt="New Projects form locations" />
          You can enter further information on estimated costs and percents.
          <Img src="/help/projects/projects_8.png" alt="New Projects form locations" />
          <Callout type="info">
            Note all this information can be edited later so if you do not have it or want to change it do not worry!
          </Callout>
        </Step>
        <Step n={3} title="Save">
          Click <strong>Create Project</strong>. The project will appear on the Projects list and the Schedule immediately.
          <br></br>
           For more information on projects details and the project table vistit the projects overview page.
        </Step>
      </Steps>

      <Callout type="info">
        Manually created projects are labeled <strong>Manually created</strong> on the project detail page.
        Projects synced from HubSpot are labeled <strong>Synced from HubSpot</strong> and will have their
        status and dates updated automatically on each sync.
      </Callout>
    </>
  );
}
