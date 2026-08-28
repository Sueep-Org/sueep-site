export type SectionTone = "complete" | "warning" | "empty" | "neutral";

const TONE_DOT: Record<SectionTone, string> = {
  complete: "bg-emerald-500",
  warning: "bg-amber-500",
  empty: "bg-gray-300",
  neutral: "bg-gray-300",
};

type Props = {
  title: string;
  /** One-line summary shown next to the title when collapsed — e.g. "•••1234 · Checking"
   * or "Not set yet". Keep it short; it's read at a glance while scanning the page. */
  status: React.ReactNode;
  tone?: SectionTone;
  /** Open by default when a section is missing something that needs attention
   * (empty/warning), so the eye lands on what's incomplete instead of everything
   * needing an equal click to check. Defaults closed otherwise. */
  defaultOpen?: boolean;
  children: React.ReactNode;
};

/** A single collapsed-by-default card with a status-line summary — used to
 * turn a long stack of always-expanded profile sections (Employee/Contractor
 * detail pages) into something scannable: see what's done and what needs
 * attention at a glance, expand only what you actually need to edit. Plain
 * <details>/<summary> so it needs no client JS of its own and works around
 * any client-component children. */
export function CollapsibleSection({ title, status, tone = "neutral", defaultOpen = false, children }: Props) {
  return (
    <details
      className="group rounded-lg border border-gray-200 bg-gray-50 [&::-webkit-details-marker]:hidden"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
          <span className="shrink-0 text-sm font-semibold text-gray-800">{title}</span>
          <span className="truncate text-xs text-gray-500">{status}</span>
        </div>
        <svg
          className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </summary>
      <div className="border-t border-gray-200 px-4 pb-4 pt-4">{children}</div>
    </details>
  );
}
