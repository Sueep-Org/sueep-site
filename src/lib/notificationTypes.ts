/**
 * Every email the ERP and website send, with who gets it and what Admins and
 * PMs can change on the Notifications page. Safe to import on the client.
 *
 * Recipients: most emails go to someone the ERP works out itself (the
 * worker, the project's PM...), described by `automatic`. `toMode` says what
 * the editable list means for that email:
 * - "recipients": the list is who gets it
 * - "also": these people get it too, on top of the automatic ones
 * - "ifNone": only used when nobody is found automatically
 * `ccEditable` is off for emails sent to many people one at a time, where a
 * cc would send the same person a copy of every one.
 */

export type NotificationGroup = "Projects & schedule" | "Turnovers" | "People" | "Insurance" | "Reminders" | "Website" | "Admin";
export type ToMode = "recipients" | "also" | "ifNone";
/** Sender name: "erp" for staff emails, "sueep" for workers and clients, "website" for site forms. */
export type SenderKind = "erp" | "sueep" | "website";

export type NotificationDef = {
  label: string;
  group: NotificationGroup;
  /** When it's sent, one short sentence */
  when: string;
  automatic: string | null;
  toMode: ToMode | null;
  /** Starting list for `toMode`; env values keep working until someone saves the setting */
  defaultTo: () => string[];
  ccEditable: boolean;
  defaultCc: string[];
  defaultEnabled: boolean;
  sender: SenderKind;
  /** False for emails that carry their own full design */
  layout: boolean;
  /** Can't be turned off on the Notifications page, e.g. sign-in codes people need to get in */
  alwaysOn: boolean;
};

const env = (name: string, fallback: string) => (process.env[name] ?? fallback).trim();
const contact = () => [env("CONTACT_TO_EMAIL", "contact@sueep.com")];

const def = (d: Partial<NotificationDef> & Pick<NotificationDef, "label" | "group" | "when">): NotificationDef => ({
  automatic: null,
  toMode: null,
  defaultTo: () => [],
  ccEditable: false,
  defaultCc: [],
  defaultEnabled: true,
  sender: "erp",
  layout: true,
  alwaysOn: false,
  ...d,
});

export const NOTIFICATIONS = {
  JOB_BRIEF: def({
    label: "Job brief",
    group: "Projects & schedule",
    when: "Someone sends a project's job brief from the project page",
    automatic: "The employees picked when sending",
    sender: "sueep",
  }),
  CHANGE_ORDER_NOTICE: def({
    label: "Change order notice",
    group: "Projects & schedule",
    when: "Someone sends a change order to employees from the project",
    automatic: "The employees picked when sending",
    sender: "sueep",
  }),
  CHANGE_ORDER_APPROVED: def({
    label: "Change order approved",
    group: "Projects & schedule",
    when: "A change order is marked approved",
    automatic: "The project's PM",
    ccEditable: true,
  }),
  PROJECT_REQUEST_RECEIVED: def({
    label: "Client request received",
    group: "Projects & schedule",
    when: "A client asks for a change order or SOV work date through their project link",
    automatic: "The project's supervisor",
    toMode: "also",
    ccEditable: true,
    defaultTo: () => [env("DOCUSEAL_SUEEP_SIGNER_EMAIL", "david@sueep.com"), "jennifer@sueep.com", "estimating@sueep.com"],
  }),
  PROJECT_REQUEST_CONFIRMATION: def({
    label: "Client request confirmation",
    group: "Projects & schedule",
    when: "Right after a client sends a request, so they know it arrived",
    automatic: "The client who sent it",
    ccEditable: true,
    sender: "sueep",
  }),
  SCHEDULE_INVITE: def({
    label: "Schedule invite",
    group: "Projects & schedule",
    when: "Someone is scheduled on a day, or that day changes or is cancelled. Includes a calendar invite.",
    automatic: "The scheduled person",
    sender: "sueep",
  }),
  RESCHEDULE_NOTICE: def({
    label: "Project rescheduled",
    group: "Projects & schedule",
    when: "A project's scheduled day is moved",
    automatic: "The supervisor and PM, or the backup PMs when no PM is found",
  }),
  SCHEDULE_NUDGE_MORNING: def({
    label: "Unscheduled projects (morning)",
    group: "Projects & schedule",
    when: "About 8am, when active projects have nobody scheduled today",
    automatic: "Each project's PM, with only their own projects (backup PMs for projects with no PM)",
  }),
  SCHEDULE_NUDGE_MIDDAY: def({
    label: "Unscheduled projects (midday)",
    group: "Projects & schedule",
    when: "About 1pm, when projects are still unscheduled today. Off unless turned on here.",
    automatic: "Each project's PM, with only their own projects (backup PMs for projects with no PM)",
    defaultEnabled: false,
  }),
  MARGIN_ALERT: def({
    label: "Turnover margin alert",
    group: "Projects & schedule",
    when: "Logged labor pushes a turnover over budget or below its margin target",
    automatic: "The turnover's PM, or the backup PMs when no PM is found",
    ccEditable: true,
  }),
  SAFETY_NOTICE: def({
    label: "Safety compliance notice",
    group: "Projects & schedule",
    when: "A worker fails a daily safety check",
    automatic: "The worker",
    ccEditable: true,
    sender: "sueep",
  }),
  SAFETY_ESCALATION: def({
    label: "Safety escalation",
    group: "Projects & schedule",
    when: "A worker reaches the safety violation limit (3 on record)",
    toMode: "recipients",
    defaultTo: () => [env("SAFETY_ESCALATION_EMAIL", "emma@sueep.com")],
    ccEditable: true,
  }),

  TURNOVER_REQUEST_CREATED: def({
    label: "New turnover request",
    group: "Turnovers",
    when: "A turnover request is created in the ERP",
    automatic: "The building's property manager and the Sueep PM",
    toMode: "ifNone",
    defaultTo: contact,
  }),
  JANITORIAL_TURNOVER_SUBMITTED: def({
    label: "Janitorial turnover submitted",
    group: "Turnovers",
    when: "Staff create a janitorial turnover in the ERP",
    automatic: "The Sueep PM and chosen employees",
    toMode: "also",
    defaultTo: () => ["david@sueep.com", "jennifer@sueep.com"],
  }),
  PROPERTY_MANAGER_TURNOVER_REQUESTED: def({
    label: "Property manager turnover request",
    group: "Turnovers",
    when: "A property manager requests a turnover on their link or the website form",
    toMode: "recipients",
    defaultTo: () => ["david@sueep.com", "jennifer@sueep.com"],
    ccEditable: true,
  }),
  PROPERTY_MANAGER_REQUEST_CONFIRMED: def({
    label: "Turnover request confirmed",
    group: "Turnovers",
    when: "Staff confirm a property manager's turnover request",
    automatic: "The property manager",
    ccEditable: true,
    sender: "sueep",
  }),
  PROPERTY_MANAGER_REQUEST_DECLINED: def({
    label: "Turnover request declined",
    group: "Turnovers",
    when: "Staff decline a property manager's turnover request",
    automatic: "The property manager",
    ccEditable: true,
    sender: "sueep",
  }),
  PROPERTY_MANAGER_CHANGE_REQUESTED: def({
    label: "Property manager turnover change",
    group: "Turnovers",
    when: "A property manager cancels a request, changes its date, or asks to cancel or move a confirmed turnover",
    toMode: "recipients",
    defaultTo: () => ["david@sueep.com", "jennifer@sueep.com"],
    ccEditable: true,
  }),
  PROPERTY_MANAGER_CHANGE_ANSWERED: def({
    label: "Turnover change answered",
    group: "Turnovers",
    when: "Staff apply or decline a property manager's cancel or new date",
    automatic: "The property manager",
    ccEditable: true,
    sender: "sueep",
  }),
  PROPERTY_MANAGER_WELCOME: def({
    label: "Property manager welcome",
    group: "Turnovers",
    when: "Someone clicks Email them their link on the Property Managers page",
    automatic: "The property manager",
    ccEditable: true,
    sender: "sueep",
  }),
  PROPERTY_MANAGER_WAITING_REMINDER: def({
    label: "Property manager requests waiting",
    group: "Reminders",
    when: "Weekday mornings, when a property manager's request or change has waited over 1 business day",
    toMode: "recipients",
    defaultTo: () => ["david@sueep.com", "jennifer@sueep.com"],
    ccEditable: true,
  }),
  PROPERTY_MANAGER_WEEKLY: def({
    label: "Property manager weekly turnovers",
    group: "Turnovers",
    when: "Monday mornings, to property managers with turnovers that week or requests waiting",
    automatic: "Each property manager, unless their Monday email is off",
    sender: "sueep",
  }),
  PROPERTY_MANAGER_SIGN_IN_CODE: def({
    label: "Property manager sign-in code",
    group: "Turnovers",
    when: "A property manager opens their turnover link on a new device",
    automatic: "The property manager",
    sender: "sueep",
    alwaysOn: true,
  }),
  TURNOVER_COMPLETION_DIGEST: def({
    label: "Turnovers completed (daily)",
    group: "Turnovers",
    when: "Each evening, listing units finished at each building",
    automatic: "The building's property manager, with Sueep PMs on bcc",
    ccEditable: true,
    defaultCc: ["contact@sueep.com", "emma@sueep.com"],
    sender: "sueep",
  }),

  CANDIDATE_UPLOAD_LINK: def({
    label: "Candidate document upload link",
    group: "People",
    when: "Someone sends a candidate their onboarding upload link",
    automatic: "The candidate",
    ccEditable: true,
    sender: "sueep",
  }),
  EMPLOYEE_INFO_LINK: def({
    label: "Employee info form link",
    group: "People",
    when: "Someone sends an employee their info form",
    automatic: "The employee",
    ccEditable: true,
    sender: "sueep",
  }),
  CONTRACTOR_INFO_LINK: def({
    label: "Contractor info form link",
    group: "People",
    when: "Someone sends a contractor their info form",
    automatic: "The contractor",
    ccEditable: true,
    sender: "sueep",
  }),
  CONTRACTOR_UPLOAD_LINK: def({
    label: "Contractor document upload link",
    group: "People",
    when: "Someone sends a contractor their document upload link",
    automatic: "The contractor",
    ccEditable: true,
    sender: "sueep",
  }),
  CLOCK_LINK: def({
    label: "Clock-in link",
    group: "People",
    when: "Someone sends a janitor their clock-in link",
    automatic: "The employee",
    ccEditable: true,
    sender: "sueep",
  }),
  TIME_OFF_LOGGED: def({
    label: "Time off logged",
    group: "People",
    when: "Time off is added for an employee or contractor",
    toMode: "recipients",
    defaultTo: () => [env("TIME_OFF_NOTIFICATION_EMAIL", "contact@sueep.com")],
    ccEditable: true,
  }),

  COI_REQUEST_RECEIVED: def({
    label: "COI request received",
    group: "Insurance",
    when: "A GC or property manager asks for a COI through the request link",
    toMode: "recipients",
    ccEditable: true,
  }),
  COI_REQUEST_LINK: def({
    label: "COI request link",
    group: "Insurance",
    when: "Someone emails the COI request link from the ERP",
    automatic: "The addresses entered when sending",
    sender: "sueep",
  }),

  MANAGEMENT_REMINDERS: def({
    label: "Management calendar reminders",
    group: "Reminders",
    when: "About 8am, when calendar items reach their category's reminder days",
    automatic: "Every Admin and PM",
  }),

  WEBSITE_CONTACT: def({
    label: "Website contact form",
    group: "Website",
    when: "Someone sends the contact form on sueep.com",
    toMode: "recipients",
    defaultTo: contact,
    ccEditable: true,
    sender: "website",
  }),
  PAINTING_LEAD: def({
    label: "Painting lead",
    group: "Website",
    when: "Someone finishes the first step of the painting quote form",
    toMode: "recipients",
    defaultTo: contact,
    ccEditable: true,
    sender: "website",
  }),
  PAINTING_QUOTE_TEAM: def({
    label: "Painting quote request",
    group: "Website",
    when: "Someone finishes the painting quote form",
    toMode: "recipients",
    defaultTo: contact,
    ccEditable: true,
    sender: "website",
  }),
  PAINTING_QUOTE_CUSTOMER: def({
    label: "Painting quote confirmation",
    group: "Website",
    when: "Right after a homeowner finishes the painting quote form",
    automatic: "The homeowner",
    sender: "sueep",
  }),

  EMAIL_FAILURES: def({
    label: "Failed emails",
    group: "Admin",
    when: "About 9am, only when emails failed to send in the last day",
    automatic: "Every Admin",
    toMode: "also",
  }),
} satisfies Record<string, NotificationDef>;

export type EmailType = keyof typeof NOTIFICATIONS;

export function isEmailType(v: unknown): v is EmailType {
  return typeof v === "string" && v in NOTIFICATIONS;
}

/** Not an email: who the "backup PMs" fallback reaches. Stored like a setting. */
export const BACKUP_PMS_KEY = "BACKUP_PMS";
export const defaultBackupPms = () => [env("DOCUSEAL_SUEEP_SIGNER_EMAIL", "david@sueep.com"), "jennifer@sueep.com"];

export const NOTIFICATION_GROUPS: NotificationGroup[] = ["Projects & schedule", "Turnovers", "People", "Insurance", "Reminders", "Website", "Admin"];

export const TO_MODE_LABEL: Record<ToMode, string> = {
  recipients: "Send to",
  also: "Also send to",
  ifNone: "If nobody is found, send to",
};

/** Lowercased, trimmed, valid-looking addresses with duplicates removed. Null when one doesn't look like an email. */
export function parseEmailList(value: unknown): string[] | null {
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[,;\s]+/);
  const out: string[] = [];
  for (const raw of list) {
    const e = String(raw).trim().toLowerCase();
    if (!e) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
    if (!out.includes(e)) out.push(e);
  }
  return out;
}
