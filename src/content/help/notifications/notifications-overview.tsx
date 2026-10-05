import { Callout, H2, P, UL, LI, Steps, Step } from "@/app/erp/components/help/HelpComponents";

export function NotificationsOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The <strong>Notifications</strong> page (left menu, under <strong>Admin</strong>) lists every email the ERP and the
        website send. Admins and Project Managers can turn each one on or off, change who gets it, and check what
        actually went out.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Turning an email on or off">
          Each email has a switch on the left. Turning it off stops it for everyone right away. Turned-off emails still
          show in the Email Log as <strong>Turned off</strong>, so you can see what would have been sent.
        </Step>

        <Step n={2} title="Changing who gets an email">
          The gray line under each email says who it goes to. Hover the <strong>i</strong> to see when it&apos;s sent.
          Click <strong>Edit</strong> to change the people you can control. What the list means depends on the email:
          <UL>
            <LI>
              <strong>Send to:</strong> these people are the only recipients (for example Time off logged).
            </LI>
            <LI>
              <strong>Also send to:</strong> the ERP picks people automatically (like the project&apos;s supervisor),
              and these people get it too.
            </LI>
            <LI>
              <strong>If nobody is found, send to:</strong> only used when the ERP can&apos;t find the usual person.
            </LI>
            <LI>
              <strong>Copy (cc):</strong> extra people copied on every one. Not offered on emails sent to many people
              one at a time, since you&apos;d get a copy of each.
            </LI>
          </UL>
          Separate addresses with commas. A <strong>Changed</strong> tag means it no longer uses the default, and{" "}
          <strong>Reset to default</strong> in the Edit window puts it back.
        </Step>

        <Step n={3} title="Backup PMs">
          The <strong>Backup PMs</strong> box at the top is who hears about a project when its PM can&apos;t be found.
          It&apos;s used by margin alerts, reschedule notices, and the daily turnover digest.
        </Step>

        <Step n={4} title="The Email Log">
          The <strong>Email Log</strong> tab lists every email sent in the last 180 days, newest first. Filter by email
          or status, or search by subject or an exact email address. Statuses:
          <UL>
            <LI>
              <strong>Sent:</strong> the email service accepted it.
            </LI>
            <LI>
              <strong>Failed:</strong> the email service rejected it. Click it to see why.
            </LI>
            <LI>
              <strong>Turned off:</strong> not sent because that email is switched off.
            </LI>
            <LI>
              <strong>Not set up:</strong> not sent because email isn&apos;t set up on that server, which is normal on a
              local test copy.
            </LI>
          </UL>
          Click any email to see exactly what it looked like. <strong>Resend</strong> sends it again to the same people.
          Emails with attachments, like calendar invites, can&apos;t be resent from here.
        </Step>

        <Step n={5} title="Good to know">
          <UL>
            <LI>
              <strong>Replies:</strong> emails to workers and clients come from a no-reply address, so when you send one
              from the ERP (a job brief, an info form link, a schedule change), replies come to you instead.
            </LI>
            <LI>
              <strong>Schedule invites:</strong> changing a day only emails the people whose date, time, address, or
              scope actually changed. Removing someone only emails them if they got an invite in the first place.
            </LI>
            <LI>
              <strong>Failed emails:</strong> Admins get one email around 9am listing anything that failed to send the
              day before. Nothing is sent on days without failures.
            </LI>
          </UL>
        </Step>
      </Steps>

      <Callout type="tip">
        A red number on the Email Log tab is how many emails failed in the last 7 days. The Settings tab shows the same
        count next to each email that had failures.
      </Callout>
    </>
  );
}
