/** Minimal RFC 5545 (.ics) builder for single-day "supervisor assigned to a
 * project" calendar invites. Hand-rolled rather than a dependency since the
 * format needed here (one all-day VEVENT, REQUEST or CANCEL) is small and
 * well-specified. */

function icsDate(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

/** DTEND for an all-day event is exclusive per RFC 5545, so it's the day after. */
function nextDayIcsDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function icsTimestamp(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** RFC 5545 requires folding lines longer than 75 octets; continuation lines start with a space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let result = "";
  let remaining = line;
  let first = true;
  while (remaining.length > 0) {
    const chunkSize = first ? 75 : 74;
    result += (first ? "" : "\r\n ") + remaining.slice(0, chunkSize);
    remaining = remaining.slice(chunkSize);
    first = false;
  }
  return result;
}

export function buildDayAssignmentInvite(params: {
  /** Stable per-assignment id — reuse across updates/cancellations so calendar apps update the same event instead of duplicating it. */
  uid: string;
  /** Day key (YYYY-MM-DD) — rendered as an all-day event. */
  dateKey: string;
  summary: string;
  description?: string;
  url?: string;
  organizerEmail: string;
  organizerName?: string;
  attendeeEmail: string;
  attendeeName?: string;
  sequence?: number;
  cancelled?: boolean;
}): string {
  const method = params.cancelled ? "CANCEL" : "REQUEST";
  const status = params.cancelled ? "CANCELLED" : "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sueep//Schedule//EN",
    `METHOD:${method}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${icsTimestamp(new Date())}`,
    `DTSTART;VALUE=DATE:${icsDate(params.dateKey)}`,
    `DTEND;VALUE=DATE:${nextDayIcsDate(params.dateKey)}`,
    `SUMMARY:${escapeIcsText(params.summary)}`,
    ...(params.description ? [`DESCRIPTION:${escapeIcsText(params.description)}`] : []),
    ...(params.url ? [`URL:${escapeIcsText(params.url)}`] : []),
    `ORGANIZER;CN=${escapeIcsText(params.organizerName ?? "Sueep")}:mailto:${params.organizerEmail}`,
    `ATTENDEE;CN=${escapeIcsText(params.attendeeName ?? params.attendeeEmail)};RSVP=TRUE:mailto:${params.attendeeEmail}`,
    `SEQUENCE:${params.sequence ?? 0}`,
    `STATUS:${status}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
