/**
 * Job brief "Main Point of Contacts" as rows (name, role, email, phone)
 * instead of one free-text box. `ProjectWorkOrderRecord.contacts` keeps the
 * text form: the original typed text until the brief is saved again, then
 * the rows written out, which is also what the job brief email shows.
 * Safe to import on the client.
 */

export type WorkOrderContact = { name: string; role: string; email: string; phone: string };

export const EMPTY_CONTACT: WorkOrderContact = { name: "", role: "", email: "", phone: "" };

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE = /\+?\d[\d\s().-]{5,}\d/;
const LABEL = /^(phone|tel|cell|mobile|email|e-mail)\s*:\s*/i;

/** "6107621474" or "+18048227650" to "(610) 762-1474"; anything else as typed. */
export function formatPhone(v: string): string {
  const t = v.trim();
  const d = t.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : t;
}

export function isValidEmail(v: string): boolean {
  return new RegExp(`^${EMAIL.source}$`).test(v.trim());
}

/** Trimmed rows with at least one field; anything not a row is dropped. */
export function cleanContactList(v: unknown): WorkOrderContact[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
      return { name: s("name"), role: s("role"), email: s("email"), phone: s("phone") ? formatPhone(s("phone")) : "" };
    })
    .filter((c) => c.name || c.role || c.email || c.phone);
}

/** One line per contact, for the email and the text column: "Name · Role · email · phone". */
export function contactsToText(list: WorkOrderContact[]): string {
  return list.map((c) => [c.name, c.role, c.email, c.phone].filter(Boolean).join(" · ")).join("\n");
}

/**
 * Reads the old free text. Each line is split on "·", " - " or commas; an
 * email and a phone are picked out wherever they are, the first remaining
 * part is the name and the rest is the role. A short line with no phone or
 * email becomes the role of the contact above when it has none
 * ("Assistant Site Superintendent"), or a name-only contact. Lines that are
 * not contacts come back in `other`, so they can go to the brief's notes
 * instead of being dropped.
 */
export function parseContactsText(text: string | null | undefined): { contacts: WorkOrderContact[]; other: string[] } {
  const contacts: WorkOrderContact[] = [];
  const other: string[] = [];
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let email = "";
    let phone = "";
    const words: string[] = [];
    for (let part of line.split(/\s+[·\-–]\s*|\s*·\s*|,\s*/)) {
      part = part.replace(LABEL, "").trim();
      const e = !email ? part.match(EMAIL) : null;
      if (e) {
        email = e[0];
        part = part.replace(e[0], "").trim();
      }
      const p = !phone ? part.match(PHONE) : null;
      if (p && p[0].replace(/\D/g, "").length >= 7) {
        phone = formatPhone(p[0]);
        part = part.replace(p[0], "").trim();
      }
      part = part.replace(LABEL, "").replace(/[:·,-]+$/, "").trim();
      if (part) words.push(part);
    }
    if (email || phone) {
      contacts.push({ name: words[0] ?? "", role: words.slice(1).join(", "), email, phone });
      continue;
    }
    const short = line.split(/\s+/).length <= 4 && words.length === 1;
    const prev = contacts[contacts.length - 1];
    if (short && prev && !prev.role) prev.role = line;
    else if (short) contacts.push({ ...EMPTY_CONTACT, name: line });
    else other.push(line);
  }
  return { contacts, other };
}
