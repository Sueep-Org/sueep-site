import { Callout, H2, H3, P, UL, LI, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function AddingEmployees() {
    return(
        <>
        <H2>Overview</H2>
        <P>Fill out at end</P>

        <H2>Steps</H2>
        <Steps>
            <Step n={1} title="Employees Page">
                Under the navigation you can navigate to the employees tab.
                <br></br><br></br>
                On this tab you will find the table of all employees currently in the ERP. Employees are either added manually or are imported from the candidates tab once they are onboarded.
                <Img src="/help/employees/employee_1.png" alt="Employees tab" />
                From this tab you can search employees by name or default project. You can also filter employees by compliance.
                <Callout type="info">By default employees are considered not configured after creation. When we go into the creation of employees and employee details 
                    what makes an employee compliant will become more clear
                </Callout>
                We can also add new employees from this page in the top right corner.
            </Step>

            <Step n={2} title= "Adding a new employee">
                When you click the <strong>Add Employee</strong> button the following form will pop up.
                <Img src="/help/employees/employee_2.png" alt="Employees form" />
                Here you can fill out information about the new employee. You can edit all this information later.
                <Callout type="info">Please not employees can also be added through the candidate onboarding process. There will be a seperate help center section on onboarding</Callout>
                Once you hit <strong>Save Employee</strong> you will be redirected to that new employees detail page.
            </Step>

            <Step n={3} title="Employee Details Page">
                All employees have an employee details page that can be navigated to by click on their name in the employees table.
                <br></br><br></br>
                You will first land on the <strong>General Info</strong> tab where you can change their name, email, phone number, role, pay, default project, status, hire date, and any notes.
                <Img src="/help/employees/employee_3.png" alt="Employees details" />
                Next is the <strong>Bank Account</strong> tab which allows you to input their banking information.
                <Img src="/help/employees/employee_4.png" alt="Employees details" />
                Next is the <strong>Documents</strong> tab. This is where employee compliance is configured.
                <br></br><br></br>
                Under required documents you will first see background check with 4 options. Here you can track if an employee has their background check done if needed.
                <br></br><br></br>
                Then we see a text box with an <strong>add</strong> button. This is where we will add all documents required for the employee to start work such as an I-9, W4, etc. 
                <Img src="/help/employees/employee_5.png" alt="Employees details" />
                When a document is added in the required section an employee cannot be considered compliant until that document is uploaded under the <strong>Documents on File</strong> section. 
                You must name the <strong>Document type</strong> the same as the name you entered as the required document or the system will not recognize that the employee has that document.
                <Img src="/help/employees/employee_6.png" alt="Employees details" />
                As you can see above we added I-9 as a required document and uploaded it under the same type making I-9 show as complete under required documents.
                <br></br><br></br>
                The final tab is contract signing. If you need to send any documents to employees for signing you can do it here. For more information on contract signing go to the <A href="/erp/help/contracts/uploading-a-contract">contract signing</A> help page.
                <Img src="/help/employees/employee_7.png" alt="Employees details" />


            </Step>
        </Steps>
        </>
    )
}