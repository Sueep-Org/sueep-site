import { Callout, Steps, Step, H2, P, Table, THead, TH, TD, A , Img, SkipTo} from "@/app/erp/components/help/HelpComponents";

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
          We use DocuSeal to handle our contracts. You want to login at <A href="https://docuseal.com">DocuSeal </A>
           with the following information: <br></br>
          <strong>Email:</strong> contact@sueep.com<br></br>
          <strong>Password: </strong>PHL215 <br></br>
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
        <Step n={5} title="Navigating to Candidate Details">
          Navigate to the contractor verification tab and click on the name of the contractor you want to send a contract
          <Img src="/help/contracts/candidate_details_1.png" alt="Candidate page" />
          Then just navigate to the signing tab! You can skip to <SkipTo href="#Contract-Signing-How">contract</SkipTo> signing now
          <Img src="/help/contracts/candidate_details_2.png" alt="Candidate details page" />
        </Step>
        </div>

        <div id="Contract-Signing-How">
        <Step n={6} title="Contract Signing">
          Click upload PDF to upload you contract.
          <Img src="/help/contracts/contract_1.png" alt="Candidate page" />
          Once you chose your file we want to click on Open in docuseal 
          <Img src="/help/contracts/contract_2.png" alt="Candidate page" />
          This is where you will land on Docuseal. We want to click edit
          <Img src="/help/contracts/contract_3.png" alt="Candidate page" />
          On this page we can place a variety of input boxes for our recipient
          <Img src="/help/contracts/contract_4.png" alt="Candidate page" />
          For example I place a signature and date field.
          <Img src="/help/contracts/contract_5.png" alt="Candidate page" />
          Now we can send it off
          <Img src="/help/contracts/contract_6.png" alt="Candidate page" />
          This pops up when we hit send. Add the email of the recipient and click “Add Recipients” and it will send it off!
          <Img src="/help/contracts/contract_7.png" alt="Candidate page" />
          It will now indicate we are awaiting signing from the recipient.
          <Img src="/help/contracts/contract_8.png" alt="Candidate page" />
          <Img src="/help/contracts/contract_9.png" alt="Candidate page" />
          Once they sign refresh and you’ll see it’s status changed!
          <Img src="/help/contracts/contract_10.png" alt="Candidate page" />
          You can also view and download the contract on Docuseal
          <Img src="/help/contracts/contract_11.png" alt="Candidate page" />

        </Step>
        </div>

      </Steps>

      <Callout type="warning">
        Please note that we are limited to 50 contracts per month so do not play around sending test contracts too much.
      </Callout>
    </>
  );
}
