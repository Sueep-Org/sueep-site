import { Callout, H2, H3, P, UL, LI, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function InputtingLaborLogs() {
    return(
        <>
        <H2>Overview</H2>
        <P>
            Labor logs let you track time worked on any project or change order. For each entry you record the date, employee, hours worked, role, hourly rate, and task. Once saved, logs appear in a table where you can filter by date or search by employee name, edit or delete entries, and rate the quality of work. You can also get a quick summary of recent logs directly from the main projects table without opening the project.
        </P>
        <Steps>
            <Step n={1} title= "Navigating to the labor log">
                There are two places we can add labor logs to.
                <ol className="mt-3 mb-3 space-y-1.5 pl-5 text-sm text-gray-700 list-decimal">
                    <li><A href="/erp/help/projects/creating-a-change-order">Change Orders</A></li>
                    <li><A href="/erp/help/projects/projects-overview">Projects</A></li>
                </ol>
                If you need help navigating to those pages click on the text above and navigate to their corresponding help sections.
            </Step>

            <Step n={2} title= "Adding a labor entry">
                First you must navigate to the labor tab of ur desired project or change order.
                <Img src="/help/labor_logs/labor_1.png" alt="Projects Table" />
                When entering a labor log you should first enter the date of the labor and chose your desired employee. 
                <Callout type="info">You must have the employee you want to add labor entries for entered as an employee in our system.</Callout>
                Based on the information you have inputted for the employee the hourly rate and role will auto-populated
                 however you can still edit them if they have a different role for the current project/change order. 
                 You will also want to enter the amount of hours the employee worked as well as their task.
            </Step>

            <Step n={3} title= "Viewing your entries">
                 Once you have entered your log it will show up below the entry box in the labor log table.
                <Img src="/help/labor_logs/labor_2.png" alt="Projects Table" />
                In this table you are able to filter all your logs for a project by date or search for an employee by name.
                <br></br><br></br>
                You can also edit a labor log by clicking the edit button to the right of the notes column. You can also delete an entry by clicking delete next to the edit button.
                <br></br><br></br>
                You can set the quality of work for that labor entry as excellent, good, fair, or poor. To the right of the quality drop down is a notes section where you can take notes on why the quality was rated the way it was.
                <br></br><br></br>
                You can also quickly view some of the most recent labor logs for a project in the main projects table when you click on the project/change order to drop down.
                <Img src="/help/labor_logs/labor_3.png" alt="Projects Table" />
                <strong>Thats all! For any more information check out the other help center articles or message the tech dev team!</strong>
            </Step>

        </Steps>
        </>
    )
}