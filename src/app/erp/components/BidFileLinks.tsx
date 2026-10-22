import { subBidFileUrl } from "@/lib/erp/subBids";

/** A sub bid's files as small paperclip links (Proposals tab, contractor Bids tab, Bidders tab). */
export function BidFileLinks({ projectId, bidId, files }: { projectId: string; bidId: string; files: { id: string; filename: string }[] }) {
  if (files.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
      {files.map((f) => (
        <a
          key={f.id}
          href={subBidFileUrl(projectId, bidId, f.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-[220px] items-center gap-0.5 text-[11px] text-gray-500 hover:text-pink-600 hover:underline"
          title={f.filename}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 shrink-0" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M15.62 4.38a3 3 0 00-4.24 0l-6.3 6.3a1.75 1.75 0 102.47 2.47l5.6-5.6a.75.75 0 111.06 1.06l-5.6 5.6a3.25 3.25 0 11-4.6-4.6l6.3-6.3a4.5 4.5 0 116.37 6.37l-6.3 6.3a.75.75 0 01-1.06-1.06l6.3-6.3a3 3 0 000-4.24z"
              clipRule="evenodd"
            />
          </svg>
          <span className="truncate">{f.filename}</span>
        </a>
      ))}
    </span>
  );
}
