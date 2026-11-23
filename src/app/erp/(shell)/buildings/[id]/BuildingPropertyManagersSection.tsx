import Link from "next/link";
import { InfoTip } from "@/app/erp/components/ui";

export type BuildingPropertyManager = { id: string; name: string; email: string; active: boolean; lastSeenAt: string | null };

/** The building's property managers: who gets its emails and can book its turnovers. On the building's Details tab. */
export function BuildingPropertyManagersSection({
  buildingId,
  managers,
  contactEmail,
  contactName,
}: {
  buildingId: string;
  managers: BuildingPropertyManager[];
  /** The building's own contact fields, to point out when that person has no link yet */
  contactEmail: string | null;
  contactName: string | null;
}) {
  const contactHasLink = !contactEmail || managers.some((m) => m.email.toLowerCase() === contactEmail.trim().toLowerCase());
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
          Property managers
          <InfoTip text="Who gets this building's emails (turnover updates, change order approvals, janitorial summaries). They can also see and book its turnovers on their private page." wide />
        </h2>
        <Link
          href={`/erp/property-managers?add=${buildingId}`}
          className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500"
        >
          + Add
        </Link>
      </div>
      {managers.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          {contactEmail
            ? `None yet. Until one is added, emails go to the building contact${contactName ? `, ${contactName}` : ""} (${contactEmail}).`
            : "None yet, so this building's emails have nowhere to go. Click Add."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 text-sm">
          {managers.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <Link href={`/erp/property-managers?open=${m.id}`} className="font-medium text-gray-900 hover:text-pink-600">
                  {m.name}
                </Link>
                <div className="truncate text-xs text-gray-500">{m.email}</div>
              </div>
              <div className="shrink-0 text-right text-xs text-gray-500">
                <span className={`rounded-full px-2 py-0.5 font-medium ${m.active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                  {m.active ? "On" : "Off"}
                </span>
                <div className="mt-0.5">
                  {m.lastSeenAt ? `Opened ${new Date(m.lastSeenAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Never opened"}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!contactHasLink && managers.length > 0 && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          The building contact{contactName ? `, ${contactName},` : ""} isn&apos;t on this list, so they don&apos;t get this building&apos;s
          emails. Click Add if they should.
        </p>
      )}
    </section>
  );
}
