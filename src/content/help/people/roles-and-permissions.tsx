import { Callout, H2, H3, P, UL, LI, Table, THead, TH, TD } from "@/app/erp/components/help/HelpComponents";

export function RolesAndPermissions() {
  return (
    <>
      <H2>What this is</H2>
      <P>
        Every ERP login has one role. The role decides which pages you see, what you can change, and which tabs your dashboard
        has. Admins set roles on <strong>User Management</strong>, which also has the full permission chart.
      </P>

      <Table>
        <THead>
          <tr>
            <TH>Role</TH>
            <TH>For</TH>
          </tr>
        </THead>
        <tbody>
          <tr>
            <TD>Admin</TD>
            <TD>Everything, plus users, the Company Info access log, and turning invoice Approve on or off.</TD>
          </tr>
          <tr>
            <TD>Project Manager</TD>
            <TD>Runs jobs and crews: projects, schedule, payroll, employees, billing, janitorial, companies, Company Info.</TD>
          </tr>
          <tr>
            <TD>Business Manager</TD>
            <TD>Everything a Project Manager can open, plus the money side: editing companies and billing, approving invoices.</TD>
          </tr>
          <tr>
            <TD>Sales</TD>
            <TD>Projects, billing, commission and reimbursements, companies, win/loss. No payroll totals.</TD>
          </tr>
          <tr>
            <TD>Estimation</TD>
            <TD>Projects, pricing and the AI Estimator.</TD>
          </tr>
          <tr>
            <TD>Supervisor</TD>
            <TD>Their own jobs on the schedule, labor logs and checklists.</TD>
          </tr>
          <tr>
            <TD>Employee</TD>
            <TD>The schedule.</TD>
          </tr>
        </tbody>
      </Table>

      <H2>Business Manager</H2>
      <P>The Business Manager opens every page a Project Manager does, with the same dashboard. On top of that they can:</P>
      <UL>
        <LI>Edit companies, their contacts and billing, and billing overrides on buildings and projects.</LI>
        <LI>Link client portal logins to companies.</LI>
        <LI>
          Review, edit, approve and discard auto-drafted invoices on <strong>Ready to send</strong>. Drafts waiting also show on
          the dashboard&apos;s <strong>Money</strong> tab under Needs action.
        </LI>
        <LI>Change the payment terms the dashboard&apos;s cash forecast uses (with Admins).</LI>
        <LI>
          See the dashboard&apos;s <strong>Overdue</strong> tab (with Admins): open invoices past their HubSpot due date, and
          open invoices 30, 60 and 90+ days after the work was finished.
        </LI>
      </UL>
      <P>Some things stay with Project Managers, since they&apos;re about running crews:</P>
      <UL>
        <LI>Only Project Managers are listed in the schedule&apos;s &quot;PM (if no supervisor)&quot; picker.</LI>
        <LI>Only Admins and Project Managers do janitorial quality checks.</LI>
      </UL>

      <H3>Time off</H3>
      <P>
        Admins, Project Managers and the Business Manager approve time off. Time off for a Project Manager, the Business
        Manager or an Admin needs an Admin to approve it, and nobody approves their own.
      </P>

      <Callout type="info">
        The Finance role was removed. What it covered is now part of the Business Manager role.
      </Callout>
    </>
  );
}
