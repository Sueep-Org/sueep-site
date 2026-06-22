import { Callout, H2, H3, P, UL, LI, Steps, Step, Img, A } from "@/app/erp/components/help/HelpComponents";

export function MaterialsLog() {
    return(
        <>
        <H2>Overview</H2>
        <P>
            The materials log lets you track all materials purchased for a project. For each entry you record the date, category, item name, quantity, unit, and total cost. Once added, entries appear in a filterable table where you can search by item name or filter by date, and edit or delete any log. The total cost shown in the top right updates based on your active filters and feeds directly into the actual material cost in the project money tab.
        </P>

        <H2>Steps</H2>
        <Steps>
            <Step n={1} title="Navigate to your desired project">
                First go to the projects page and navigate to your desired project and click on the title of it.
                <br></br><br></br>
                This will bring you to the projects detail page. We will then navigate to the materials tab on that page.
            </Step>

            <Step n={2} title="Add and manage your projects materials">
                <Img src="/help/materials/materials_1.png" alt="Material Log" />
                From here you can add the date you got the materials, category, item, quanitity, total cost, unti, and any extra notes.
                <br></br><br></br>
                Once you click add material it will add into the material log below. Here you can filter materials by date or item name. You can also delete and edit logs. 
                In the top right corner you will see the total cost of all materials based on your filtering.
                <Img src="/help/materials/materials_1.png" alt="Material Log" />
                <Callout type="info">The total cost for materials here is what populates into actual material cost in the money tab.</Callout>
                <br></br><br></br>
                <strong>Thats all! For any more information check out the other help center articles or message the tech dev team!</strong>
            
            </Step>
        </Steps>
        </>
    )
}