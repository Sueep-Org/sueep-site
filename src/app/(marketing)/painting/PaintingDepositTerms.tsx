/** Shared copy for /painting/contract and the on-site deposit checkout page. */
export default function PaintingDepositTerms() {
  return (
    <section className="space-y-6 text-gray-800 leading-relaxed">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Deposit (50% of planning midpoint)</h2>
        <p className="mt-2 text-sm md:text-base">
          Your deposit equals fifty percent (50%) of the midpoint of the planning range you saw online. It reserves crew time and allows Sueep to schedule your project and purchase paint and related materials. Final project price may differ after an on-site scope; any change will be documented before work proceeds.
        </p>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Scheduling & materials</h2>
        <p className="mt-2 text-sm md:text-base">
          After deposit, Sueep will confirm dates and material orders subject to product availability and weather for exterior work. Delays outside Sueep&apos;s control may require rescheduling.
        </p>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Cancellation & refunds</h2>
        <p className="mt-2 text-sm md:text-base">
          Cancellation and refund details depend on timing and materials ordered. Contact Sueep before your start date to discuss your situation.
        </p>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
        <p className="mt-2 text-sm md:text-base">
          Questions:{" "}
          <a href="mailto:contact@sueep.com" className="text-[#E73C6E] font-medium hover:underline">
            contact@sueep.com
          </a>{" "}
          or{" "}
          <a href="tel:+12675811228" className="text-[#E73C6E] font-medium hover:underline">
            (267) 581-1228
          </a>
          .
        </p>
      </div>
    </section>
  );
}
