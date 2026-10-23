/** The High priority mark, like HubSpot's. */
export function FlameIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`shrink-0 text-orange-500 ${className}`} fill="currentColor">
      <path d="M8.6 1.1c.2 2.1-.7 3.4-1.7 4.6C5.8 7 4.6 8.4 4.6 10.5 4.6 13 6.4 15 8.8 15c2.6 0 4.6-2 4.6-4.8 0-2.3-1.2-4.2-2.6-5.4.1 1.3-.3 2.4-1.1 3 .1-2.8-.8-5.2-1.1-6.7Z" />
    </svg>
  );
}
