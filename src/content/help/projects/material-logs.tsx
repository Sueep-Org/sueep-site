import { Callout, H2, P, Steps, Step, Img } from "@/app/erp/components/help/HelpComponents";

export function MaterialsLog() {
    return(
        <>
        <H2>Overview</H2>
        <P>
            The materials log tracks what was bought for a project. Each entry has a date, category, item, quantity, unit and cost. Entries show in a table below the form, where you can filter by date or item and edit or delete any entry. The total cost of the log feeds the actual material cost on the project&apos;s Financials summary.
        </P>

        <H2>Steps</H2>
        <Steps>
            <Step n={1} title="Open the project's Materials tab">
                Open the project from the Projects page. In the tab bar, open the <strong>Financials</strong> menu and pick <strong>Materials</strong>.
            </Step>

            <Step n={2} title="Add an entry">
                <Img src="/help/materials/materials_1.png" alt="Materials tab" />
                Under <strong>Add material entry</strong>, fill in the date, category (Cleaning products or Paint), item and cost. Quantity, unit and notes are optional. The entry is added to the table below.
            </Step>

            <Step n={3} title="Find, edit or delete entries">
                Use <strong>Filter by date</strong> or <strong>Filter by item</strong> to narrow the table. While a filter is on, the top right shows the total of what&apos;s showing. Each row can be edited or deleted.
                <Callout type="info">The full total, not the filtered one, is what counts as the project&apos;s actual material cost.</Callout>
            </Step>
        </Steps>
        </>
    )
}
