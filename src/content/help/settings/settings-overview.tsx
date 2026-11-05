import { Callout, H2, P, Steps, Step, UL, LI } from "@/app/erp/components/help/HelpComponents";

export function SettingsOverview() {
  return (
    <>
      <H2>Overview</H2>
      <P>
        The <strong>Settings</strong> page (left menu, under <strong>Admin</strong>) holds business rules the ERP uses, like
        prices, pay periods, the company&apos;s share of health premiums, and how long clients take to pay. Admins and the Business
        Manager can open it and change anything on it.
      </P>

      <H2>Steps</H2>
      <Steps>
        <Step n={1} title="Pick a tab">
          Settings are grouped by area: <strong>Pricing</strong>, <strong>Payroll</strong>, <strong>Commission</strong>,{" "}
          <strong>Finance</strong>, <strong>Alerts</strong> and <strong>Lists</strong>.
          Hover the{" "}
          <strong>i</strong> next to a setting to see what it changes.
        </Step>
        <Step n={2} title="Change a value">
          Type the new value and click <strong>Save</strong>. <strong>Cancel</strong> puts the box back. If the value is
          out of range, the page says what&apos;s allowed.
        </Step>
        <Step n={3} title="Go back to the default">
          Under each setting it says what the default is. <strong>Reset to default</strong> shows up when a setting is
          different from it.
        </Step>
        <Step n={4} title="Bigger editors">
          <strong>Employer tax rates</strong> and <strong>Health insurance</strong> open the same windows as on the Payroll
          page. Changes in either place are the same thing.
        </Step>
        <Step n={5} title="History">
          The <strong>History</strong> tab lists every change, newest first: what changed, from what to what, who, and
          when. Use it to see why a number moved or to put an old value back by hand.
        </Step>
      </Steps>

      <H2>Pricing tab</H2>
      <UL>
        <LI>
          <strong>Next day upcharge:</strong> the extra percent for work starting today or tomorrow, on turnovers and
          change orders. The request forms and property manager calendar show the same number.
        </LI>
        <LI>
          <strong>Change orders:</strong> what we charge and what we pay per cleaner and supervisor hour, and the hours in
          a work day. A project with its own rates (Change orders tab) keeps them.
        </LI>
        <LI>
          <strong>Janitorial contracts:</strong> the sales tax a new contract&apos;s price calculator starts with.
        </LI>
        <LI>
          <strong>Price lists:</strong> the standard turnover prices and the standard change order issues. Click{" "}
          <strong>Open</strong> to edit one. Buildings without their own prices use these, and a new building starts with
          them. A building&apos;s own prices are on its Pricing Package tab.
        </LI>
        <LI>A new price only changes new quotes and change orders. Jobs already priced keep their price.</LI>
      </UL>

      <H2>Rules that change pay or commission</H2>
      <P>
        Overtime, hours in a work year, the unpaid break, commission tiers, the yearly accelerator amount and recurring
        commission keep every value with the day it started. When you save one, the page asks:
      </P>
      <UL>
        <LI>
          <strong>Starting from a date:</strong> pay weeks, shifts, deals or contract months on or after that date use the
          new number. Earlier ones keep the old number, so past pay and commission don&apos;t change. Use this when the rule
          really changes, like a new commission plan from January 1.
        </LI>
        <LI>
          <strong>Recalculate everything:</strong> every date, past and future, uses the new number, and past pay, job costs
          and commission on screen change to match. Use this to fix a number that was wrong from the start.
        </LI>
      </UL>
      <P>
        Under a setting that changed over time, the page lists each value with its dates. Payroll and commission already
        paid out aren&apos;t changed by either choice, only what the ERP shows and calculates.
      </P>
      <P>
        The late/early flag, far-from-building distance, auto inactive months and safety limit only raise flags, so they
        apply right away without asking.
      </P>

      <H2>Alerts tab</H2>
      <P>
        When the dashboard and emails flag something: how much of a budget a job can use before it turns amber, how long a
        change order can wait, how far ahead bids show, when the billing cutoff reminder goes out, when janitorial invoice
        drafts appear, and more. Hover the <strong>i</strong> on each to see which card or email it changes. Dashboard
        cards can take up to an hour to show a new number.
      </P>

      <H2>Lists tab</H2>
      <P>
        The choices in some dropdowns: service types, why a schedule day was removed, hiring sources and janitorial
        roles. Rename an item by typing, use the arrows to reorder, <strong>Hide</strong> to stop offering one, and{" "}
        <strong>+ Add</strong> for a new one, then <strong>Save</strong>. Hidden items stay so older records still show
        them. &quot;Placed by mistake&quot; can&apos;t be hidden because it&apos;s the one that deletes the day.
      </P>

      <H2>Good to know</H2>
      <UL>
        <LI>Changes apply as soon as you save. Pages that were already open show them after a refresh.</LI>
        <LI>
          <strong>Pay periods start on</strong> moves every pay period, past ones too. Only change it if the pay schedule
          really changed.
        </LI>
        <LI>
          Users, which emails go out, and company details have their own pages, linked at the bottom of Settings.
        </LI>
      </UL>

      <Callout type="tip">Every setting starts at the number the ERP used before, shown as its default.</Callout>
    </>
  );
}
