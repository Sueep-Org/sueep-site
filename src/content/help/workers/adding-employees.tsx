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
                On this tab you will find the table of all employees currently in the ERP.
                <Img src="/help/employees/employees_1.png" alt="Employees tab" />
                From this tab you can search employees by name or default project. You can also filter employees by compliance.
                <Callout type="info">By default employees are considered not configured after creation. When we go into the creation of employees and employee details 
                    what makes an employee compliant will become more clear
                </Callout>

            </Step>
        </Steps>
        </>
    )
}