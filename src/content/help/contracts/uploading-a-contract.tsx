import { Callout, Steps, Step, H2, P, A, Img, ImgPlaceholder, SkipTo } from "@/app/erp/components/help/HelpComponents";

export function UploadingAContract() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        Contracts are uploaded as PDFs directly in the ERP and then managed entirely in DocuSeal
        including placing signature fields and sending to the signer. The ERP tracks status automatically.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Login to DocuSeal">
          We use DocuSeal to handle our contracts. You want to login at <A href="https://docuseal.com">DocuSeal </A>.
          <Callout type="info">
            Ask an admin for the shared DocuSeal login. It isn&apos;t published here since this
            help center is visible to a broad set of ERP roles.
          </Callout>
        </Step>

        <Step n={2} title="Where can we create and sign contracts?">
          There are currently 4 places we handle contract signing: <br></br>
          <ol className="mt-3 space-y-1.5 pl-5 text-sm text-gray-700 list-decimal">
            <li><SkipTo href="#CO-Details-Nav">Change order details</SkipTo></li>
            <li><SkipTo href="#Employee-Details-Nav">Employee details</SkipTo> </li>
            <li><SkipTo href="#Contractor-Details-Nav">Contractor Details</SkipTo></li>
            <li><SkipTo href="#Candidate-Details-Nav">Candidate Details</SkipTo></li>
          </ol>
          <br></br>
          We will go through how to find each of these sections and then the general process for contract
          signing. If you already know where these sections are skip to <SkipTo href="#Contract-Signing-How">Contract Signing</SkipTo>

        </Step>

        <div id="CO-Details-Nav">
        <Step n={3} title="Navigating to Change Order Details">
          Click on the desired project you want to send change order contracts on:
          <Img src="/help/contracts/co_details_1.png" alt="Projects page" />
          Navigate to “Change Orders” tab under your desired project and click view details
          <Img src="/help/contracts/co_details_2.png" alt="Project details page" />
          Then just navigate to the signing tab! You can skip to <SkipTo href="#Contract-Signing-How">contract</SkipTo> signing now
          <Img src="/help/contracts/co_details_3.png" alt="Change order details page" />
        </Step>
        </div>

        <div id="Employee-Details-Nav">
        <Step n={4} title="Navigating to Employee Details">
          Navigate to the employees tab and click on the name of the employee you want to send a contract
          <Img src="/help/contracts/employee_details_1.png" alt="Employees page" />
          Then just navigate to the signing tab! You can skip to <SkipTo href="#Contract-Signing-How">contract</SkipTo> signing now
          <Img src="/help/contracts/employee_details_2.png" alt="Employee details page" />
        </Step>
        </div>

        <div id="Contractor-Details-Nav">
        <Step n={5} title="Navigating to Contractor Details">
          Navigate to the contractor verification tab and click on the name of the contractor you want to send a contract
          <Img src="/help/contracts/contractor_details_1.png" alt="Contractors page" />
          Then just navigate to the signing tab! You can skip to <SkipTo href="#Contract-Signing-How">contract</SkipTo> signing now
          <Img src="/help/contracts/contractor_details_2.png" alt="Contractor details page" />
        </Step>
        </div>

        <div id="Candidate-Details-Nav">
        <Step n={6} title="Navigating to Candidate Details">
          Navigate to the candidates tab and click on the name of the candidate you want to send a contract
          <Img src="/help/contracts/candidate_details_1.png" alt="Candidate page" />
          Then just navigate to the signing tab! You can skip to <SkipTo href="#Contract-Signing-How">contract</SkipTo> signing now
          <Img src="/help/contracts/candidate_details_2.png" alt="Candidate details page" />
        </Step>
        </div>

        <div id="Contract-Signing-How">
        <Step n={7} title="Contract Signing">
          Click <strong>Upload PDF for e-signature</strong> to upload your contract.
          <Img src="/help/contracts/contract_1.png" alt="Upload PDF button" />
          Once you&apos;ve chosen your file, click <strong>Open in DocuSeal</strong>.
          <Img src="/help/contracts/contract_2.png" alt="Open in DocuSeal button" />
          This is where you&apos;ll land in DocuSeal. Click <strong>Edit</strong>.
          <Img src="/help/contracts/contract_3.png" alt="DocuSeal template page" />
          On this page you can place a variety of input fields for your recipient.
          <Img src="/help/contracts/contract_4.png" alt="Placing input fields in DocuSeal" />
          For example, place a signature and date field.
          <Img src="/help/contracts/contract_5.png" alt="Signature and date field placement" />
          Now you can send it off.
          <Img src="/help/contracts/contract_6.png" alt="Send contract button" />
          This pops up when you hit send. Add the recipient&apos;s email and click{" "}
          <strong>Add Recipients</strong> to send it off.
          <Img src="/help/contracts/contract_7.png" alt="Add recipients dialog" />
          It will now show as awaiting signature from the recipient.
          <Img src="/help/contracts/contract_8.png" alt="Awaiting signature status" />
          <Img src="/help/contracts/contract_9.png" alt="Awaiting signature status detail" />
          Once they sign, refresh the page and you&apos;ll see the status change.
          <Img src="/help/contracts/contract_10.png" alt="Signed status" />
          You can also view and download the contract directly in DocuSeal, or click{" "}
          <strong>Download signed copy</strong> once it&apos;s signed to get it from the ERP
          instead.
          <Img src="/help/contracts/contract_11.png" alt="View and download the contract" />
        </Step>
        </div>

        <Step n={8} title="Already have a signed contract?">
          If a contract was already signed outside DocuSeal (in person, or through another tool),
          you don&apos;t need to run it through DocuSeal at all. Click{" "}
          <strong>Already signed? Upload it here</strong> instead, and the PDF is stored directly
          with a Signed status.
          <ImgPlaceholder label="Already signed? Upload it here link, next to Upload PDF for e-signature" size="sm" />
        </Step>

        <Step n={9} title="Removing a contract">
          Click <strong>Remove</strong> next to any contract row to delete it. You&apos;ll be asked
          to confirm first, since this can&apos;t be undone.
        </Step>
      </Steps>

      <Callout type="warning">
        We&apos;re limited to 50 contracts per month on our DocuSeal plan, so don&apos;t send test
        contracts through it more than you need to.
      </Callout>
    </>
  );
}
