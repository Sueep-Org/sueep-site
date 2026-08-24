import { Callout, H2, P, UL, LI, Steps, Step, ImgPlaceholder, A } from "@/app/erp/components/help/HelpComponents";

export function QualityChecks() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        A quality check records a supervisor&apos;s sign-off on a piece of completed work: what was
        checked, who checked it, their signature, evidence photos, and whether a PM approved it.
        There&apos;s no standalone Quality Checks page in the left nav, it lives entirely on the{" "}
        <strong>Quality Checks</strong> tab of a project.
      </P>
      <Callout type="info">
        Janitorial turnover units don&apos;t get this tab at all. Their quality check is the
        unit&apos;s own <strong>Checklist</strong> tab instead, see{" "}
        <A href="/erp/help/turnover/creating-a-request">Creating a Turnover Request</A> for that
        workflow.
      </Callout>

      <Steps>
        <Step n={1} title="Creating a quality check">
          From a project&apos;s <strong>Quality Checks</strong> tab, click{" "}
          <strong>+ New quality check</strong>.
          <ImgPlaceholder label="New quality check button and form on a project's Quality Checks tab" />
          <UL>
            <LI>
              If the project has Schedule of Values items set up, tag the SOV item(s) this check
              covers instead of typing anything. A project with no SOV items yet (or a turnover
              request, if you started this from the standalone form) falls back to a short free-text{" "}
              <strong>Scope</strong> field instead.
            </LI>
            <LI>Enter the supervisor&apos;s name, required to save.</LI>
            <LI>Draw the supervisor&apos;s signature directly in the browser.</LI>
            <LI>Check <strong>PM approval</strong> once a PM has signed off.</LI>
            <LI>Upload evidence photos, any number, straight from the form.</LI>
            <LI>Add any inspection notes, issues found, or follow-up items.</LI>
          </UL>
          Click <strong>Create quality check</strong> to save it.
        </Step>

        <Step n={2} title="The quality checks table">
          Saved checks show up in a table on the same tab: which project or request, scope, the
          supervisor, whether a PM approved it, how many evidence photos, and notes. Use the search
          box to filter by any of those.
          <ImgPlaceholder label="Quality checks table with search" />
        </Step>

        <Step n={3} title="Viewing and editing a check">
          Click <strong>View</strong> on any row to open that check&apos;s own page. Every field
          from creation can be edited here too, including adding more evidence photos or removing
          ones already uploaded. Click <strong>Save quality check</strong> when you&apos;re done.
          <ImgPlaceholder label="Quality check detail page" />
        </Step>
      </Steps>
    </>
  );
}
