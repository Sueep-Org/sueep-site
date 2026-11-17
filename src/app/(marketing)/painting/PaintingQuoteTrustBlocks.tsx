/**
 * Compact trust + next-steps copy for the quote / deposit step.
 * Wording aligns with claims on /painting (bonded, insured, satisfaction).
 */
export function PaintingQuoteTrustLeft() {
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Why homeowners use Sueep</p>
      <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-gray-700">
        <li className="flex gap-2">
          <span className="shrink-0 font-semibold text-[#E73C6E]" aria-hidden>
            ✓
          </span>
          <span>
            <strong className="text-gray-900">Licensed &amp; insured</strong> — bonded crew, COIs available on request.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="shrink-0 font-semibold text-[#E73C6E]" aria-hidden>
            ✓
          </span>
          <span>
            <strong className="text-gray-900">No surprise pricing</strong> — final scope &amp; price in writing before work begins.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="shrink-0 font-semibold text-[#E73C6E]" aria-hidden>
            ✓
          </span>
          <span>
            <strong className="text-gray-900">Stand behind the work</strong> — we make it right; see your agreement for details.
          </span>
        </li>
      </ul>
      <p className="mt-2 border-t border-gray-100 pt-2 text-[10px] text-gray-500">
        Greater Philadelphia, Main Line, Bucks, Montgomery, Delaware County &amp; South Jersey.
      </p>
    </div>
  );
}

const phoneDisplay = "(267) 581-1228";
const phoneHref = "tel:+12675811228";

export function PaintingQuoteTrustRight() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-pink-100 bg-gradient-to-b from-pink-50/60 to-white p-3 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#E73C6E]">What happens after you pay</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-snug text-gray-700 marker:font-semibold marker:text-gray-900">
          <li>We reach out to confirm details and target dates.</li>
          <li>On-site review if needed; you get the final price in writing before paint day.</li>
          <li>Your deposit holds the crew and orders materials — you always know what you&apos;re paying for.</li>
        </ol>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Prefer to talk it through?</p>
        <a
          href={phoneHref}
          className="mt-1 inline-block text-base font-bold text-[#E73C6E] hover:underline"
          aria-label={`Call Sueep at ${phoneDisplay}`}
        >
          {phoneDisplay}
        </a>
        <p className="mt-1 text-[10px] text-gray-500">Same team — we can walk through the quote before you check out.</p>
      </div>

      <p className="text-center text-[10px] leading-snug text-gray-500">
        <span className="font-medium text-gray-700">Encrypted checkout</span>
        <span className="mx-1 text-gray-300" aria-hidden>
          ·
        </span>
        <span>Stripe</span>
        <span className="mx-1 text-gray-300" aria-hidden>
          ·
        </span>
        <span>Cards only</span>
      </p>
    </div>
  );
}
