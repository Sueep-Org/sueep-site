import Link from "next/link";
import { InfoTip } from "@/app/erp/components/ui";
import { BILLING_FREQUENCY_LABELS, BILLING_METHOD_LABELS } from "@/lib/erp/clientCompanies";
import type { DestinationSource, InvoiceDestination, Sourced } from "@/lib/erp/invoiceDestination";

const SOURCE_LABEL: Record<DestinationSource, string> = {
  project: "Project override",
  building: "Building override",
  company: "Company",
};

function SourceTag({ source, name }: { source: DestinationSource | null; name: string | null }) {
  if (!source) return null;
  const tone = source === "company" ? "bg-gray-100 text-gray-600" : "bg-amber-50 text-amber-800";
  return (
    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone}`} title={name ?? undefined}>
      {source === "company" ? `From ${name}` : SOURCE_LABEL[source]}
    </span>
  );
}

function Row({ label, field, render }: { label: string; field: Sourced<unknown>; render: string | React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 py-1">
      <dt className="w-20 shrink-0 text-xs text-gray-500">{label}</dt>
      <dd className="min-w-0 text-sm text-gray-900">
        {render || <span className="text-gray-400">Not set</span>}
        <SourceTag source={field.source} name={field.sourceName} />
      </dd>
    </div>
  );
}

/** "Invoices go to": the resolved billing destination and where each part came from. */
export function InvoiceDestinationCard({ destination }: { destination: InvoiceDestination }) {
  const d = destination;
  const terms = [
    d.frequency ? BILLING_FREQUENCY_LABELS[d.frequency] : null,
    d.cutoffDay ? `Due by the ${ordinal(d.cutoffDay)}` : null,
    d.paymentTermsDays != null ? `Net ${d.paymentTermsDays}` : null,
  ].filter(Boolean);
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
      <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Invoices go to
        <InfoTip text="Each line comes from the most specific place that sets it: the project's override, then the building's, then the client company's billing profile." />
      </p>
      {!d.company && !d.method.source && !d.sendTo.source ? (
        <p className="mt-2 text-sm text-gray-500">No client company or billing info yet.</p>
      ) : (
        <dl className="mt-1">
          {d.company && (
            <div className="flex flex-wrap items-baseline gap-x-2 py-1">
              <dt className="w-20 shrink-0 text-xs text-gray-500">Client</dt>
              <dd className="text-sm">
                <Link href={`/erp/companies/${d.company.id}`} className="font-medium text-pink-600 hover:underline">
                  {d.company.name}
                </Link>
                {d.company.via === "building" && <span className="ml-2 text-[11px] text-gray-500">(manages the building)</span>}
              </dd>
            </div>
          )}
          <Row label="Method" field={d.method} render={d.method.value ? BILLING_METHOD_LABELS[d.method.value] : ""} />
          <Row label="Send to" field={d.sendTo} render={d.sendTo.value.join(", ")} />
          {(d.cc.value.length > 0 || d.cc.source) && <Row label="Cc" field={d.cc} render={d.cc.value.join(", ")} />}
          {d.portalUrl.value && (
            <Row
              label="Portal"
              field={d.portalUrl}
              render={
                <a href={d.portalUrl.value} target="_blank" rel="noreferrer" className="text-pink-600 hover:underline">
                  Open
                </a>
              }
            />
          )}
          {terms.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-2 py-1">
              <dt className="w-20 shrink-0 text-xs text-gray-500">Terms</dt>
              <dd className="text-sm text-gray-900">
                {terms.join(" · ")}
                {d.cutoffNote && <span className="ml-1 text-gray-500">({d.cutoffNote})</span>}
              </dd>
            </div>
          )}
          {d.notes.map((n, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-x-2 py-1">
              <dt className="w-20 shrink-0 text-xs text-gray-500">{i === 0 ? "Notes" : ""}</dt>
              <dd className="min-w-0 whitespace-pre-line text-sm text-gray-900">
                {n.text}
                <SourceTag source={n.source} name={n.sourceName} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
