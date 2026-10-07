import { Callout, H2, P, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function MyNotifications() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The <strong>Notifications</strong> page (bell in the left menu) lists every ERP email sent to the address you sign
        in with, newest first. The pink number on the bell is how many you haven&apos;t opened yet.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Reading an email">
          Click any email to see it exactly as it was sent. Opening it marks it read. If the email is about something in
          the ERP, like a project or a time off request, click <strong>Open in ERP</strong> to go straight there.
        </Step>
        <Step n={2} title="Filtering">
          Pick an area (Projects &amp; schedule, Turnovers, People...) to narrow the list, or click{" "}
          <strong>Unread only</strong>. <strong>Mark all read</strong> clears the count.
        </Step>
        <Step n={3} title="All emails (Admins)">
          Admins also get an <strong>All emails</strong> tab with every email the ERP has sent, to anyone. Search it by
          subject or by an exact email address. Only emails sent to you count toward your unread number.
        </Step>
      </Steps>

      <Callout type="tip">
        Emails sent before October 5, 2026, sign-in codes, and emails that failed or were turned off aren&apos;t listed. Bcc
        recipients are never shown. Admins and PMs can see failed emails in the Email Log on Notification Management.
      </Callout>
    </>
  );
}
