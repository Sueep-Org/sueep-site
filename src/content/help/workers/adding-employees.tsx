import { Callout, H2, P, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function AddingEmployees() {
    return(
        <>
        <H2>Overview</H2>
        <P>
            The employees section lets you manage everyone working in the system. Employees can be added manually or brought in through the candidate onboarding process. Each employee has a details page where you can manage their general info, personal details and documents, labor history, and contract signing. Employee compliance is tracked through the required documents section: an employee is considered compliant once every required document has a matching file uploaded. You can search and filter the employees table by name, default project, or compliance status.
        </P>

        <H2>Steps</H2>
        <Steps>
            <Step n={1} title="Employees Page">
                Under the navigation you can navigate to the employees tab.
                <br></br><br></br>
                On this tab you will find the table of all employees currently in the ERP. Employees are either added manually or are imported from the candidates tab once they are onboarded (see <A href="/erp/help/sops/onboarding-new-employee">Onboarding a New Employee</A>).
                <Img src="/help/employees/employee_1.png" alt="Employees tab" />
                From this tab you can search employees by name or default project. You can also filter employees by compliance.
                <Callout type="info">Background check status isn&apos;t part of compliance. Compliance only counts required documents on file.</Callout>
                We can also add new employees from this page in the top right corner.
            </Step>

            <Step n={2} title= "Adding a new employee">
                When you click the <strong>Add employee</strong> button the following form will pop up.
                <Img src="/help/employees/employee_2.png" alt="Employees form" />
                Here you can fill out information about the new employee, including whether they&apos;re paid hourly or salary, and whether they&apos;re an offshore employee with a fixed monthly rate. You can edit all this information later.
                <Callout type="info">Please note employees can also be added through the candidate onboarding process. See <A href="/erp/help/sops/onboarding-new-employee">Onboarding a New Employee</A> for that flow.</Callout>
                Once you hit <strong>Save employee</strong> you will be redirected to that new employee&apos;s detail page.
            </Step>

            <Step n={3} title="Employee Details Page">
                All employees have an employee details page that can be navigated to by clicking on their name in the employees table. It has 5 tabs.
                <br></br><br></br>
                You will first land on the <strong>General Info</strong> tab where you can change their name, email, phone number, role, pay type and rate, default project, status, hire date, offshore status, and any notes.
                <Img src="/help/employees/employee_3.png" alt="Employees details" />
                <Callout type="info">Pay fields, bank info, and SSN are only visible to roles allowed to see pay information.</Callout>
                Next is the <strong>Personal &amp; Documents</strong> tab. This tab combines their SSN, bank account details, and required documents in one place, and this is where employee compliance is configured.
                <br></br><br></br>
                Under required documents you will first see background check with 4 options: Not done, Pending, Passed, or Failed. Here you can track if an employee has their background check done if needed. This is tracked separately from compliance.
                <br></br><br></br>
                Then we see a text box with an <strong>add</strong> button. This is where we will add all documents required for the employee to start work such as an I-9, W4, etc.
                <Img src="/help/employees/employee_5.png" alt="Employees details" />
                When a document is added in the required section an employee cannot be considered compliant until that document is uploaded under the <strong>Documents on File</strong> section.
                You must name the <strong>Document type</strong> the same as the name you entered as the required document or the system will not recognize that the employee has that document.
                <Img src="/help/employees/employee_6.png" alt="Employees details" />
                As you can see above we added I-9 as a required document and uploaded it under the same type making I-9 show as complete under required documents.
                <br></br><br></br>
                Next is the <strong>Time Off</strong> tab. This is where vacation, sick days, half days, and other time off get logged for the employee. Any time off logged here blocks that employee from being scheduled on the calendar for those days.
                <Callout type="info">A PM or Admin can override the time off block and schedule the employee anyway if needed. Logged entries can be edited or deleted from this tab too.</Callout>
                <br></br><br></br>
                Next is the <strong>Labor</strong> tab, showing this employee&apos;s own labor entries across every project they&apos;ve worked on. See <A href="/erp/help/workers/labor-logs">Inputting Labor Logs</A>.
                <br></br><br></br>
                The final tab is <strong>Signing</strong>. If you need to send any documents to this employee for signing you can do it here. For more information on contract signing go to the <A href="/erp/help/contracts/uploading-a-contract">Uploading a Contract</A> help page.
                <Img src="/help/employees/employee_7.png" alt="Employees details" />
                <br></br><br></br>
                There&apos;s also a <strong>Delete employee</strong> button on the General Info tab, if you ever need to remove someone entirely.

                <strong>Thats all! For any more information check out the other help center articles or message the tech dev team!</strong>

            </Step>
        </Steps>
        </>
    )
}
