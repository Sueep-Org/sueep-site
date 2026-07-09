/** Minimal RFC 5545 (.ics) builder for single-day "supervisor assigned to a
 * project" calendar invites. Hand-rolled rather than a dependency since the
 * format needed here (one VEVENT — all-day or timed — REQUEST or CANCEL) is
 * small and well-specified. */

// Business operates on the US East Coast — used for timed events. Calendar
// clients resolve this from their own IANA tzdata even without an embedded
// VTIMEZONE block, so DST is handled correctly without us tracking offsets.
const DEFAULT_TZID = "America/New_York";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function icsDate(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

/** DTEND for an all-day event is exclusive per RFC 5545, so it's the day after. */
function nextDayIcsDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Local wall-clock datetime for a TZID-qualified DTSTART/DTEND, e.g. "20260715T080000". */
function icsLocalDateTime(dateKey: string, time: string): string {
  return `${icsDate(dateKey)}T${time.replace(":", "")}00`;
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
  /** Day key (YYYY-MM-DD). */
  dateKey: string;
  /** Optional "HH:MM" (24h) local times — event is all-day unless both are set and valid. */
  startTime?: string | null;
  endTime?: string | null;
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

  const hasTimes =
    !!params.startTime && !!params.endTime && TIME_RE.test(params.startTime) && TIME_RE.test(params.endTime);

  const dtStartLine = hasTimes
    ? `DTSTART;TZID=${DEFAULT_TZID}:${icsLocalDateTime(params.dateKey, params.startTime!)}`
    : `DTSTART;VALUE=DATE:${icsDate(params.dateKey)}`;
  const dtEndLine = hasTimes
    ? `DTEND;TZID=${DEFAULT_TZID}:${icsLocalDateTime(params.dateKey, params.endTime!)}`
    : `DTEND;VALUE=DATE:${nextDayIcsDate(params.dateKey)}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sueep//Schedule//EN",
    `METHOD:${method}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${icsTimestamp(new Date())}`,
    dtStartLine,
    dtEndLine,
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
