function pick(desc: string, label: string): string | null {
  return (
    desc
      .split(/\r?\n/)
      .find((l) => l.trim().toLowerCase().startsWith(`${label.toLowerCase()}:`))
      ?.replace(new RegExp(`^${label}:\\s*`, "i"), "")
      .trim() || null
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

export function RealEstateProjectDetails({ description }: { description: string }) {
  const address    = pick(description, "Property");
  const type       = pick(description, "Type");
  const bedrooms   = pick(description, "Bedrooms");
  const bathrooms  = pick(description, "Bathrooms");
  const sqft       = pick(description, "Square Footage");
  const furnished  = pick(description, "Furnished");
  const agentName      = pick(description, "Agent");
  const agentEmail     = pick(description, "Agent Email");
  const agentPhone     = pick(description, "Agent Phone");
  const cleanDate      = pick(description, "Clean Date");
  const moveInDate     = pick(description, "Move-in Date");
  const notes          = pick(description, "Notes");
  const services       = pick(description, "Services");
  const estimatedPrice = pick(description, "Estimated Price");

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-4">
      {/* Address */}
      {address && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-400">Property</p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">{address}</p>
        </div>
      )}

      {/* Property details grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-gray-100 pt-3">
        <Row label="Type" value={type} />
        <Row label="Bedrooms" value={bedrooms} />
        <Row label="Bathrooms" value={bathrooms} />
        <Row label="Sq Ft" value={sqft} />
        <Row label="Furnished" value={furnished} />
        <Row label="Clean Date" value={cleanDate} />
        <Row label="Move-in / Listing" value={moveInDate} />
      </div>

      {/* Agent */}
      {(agentName || agentEmail || agentPhone) && (
        <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Row label="Agent" value={agentName} />
          <Row label="Email" value={agentEmail} />
          <Row label="Phone" value={agentPhone} />
        </div>
      )}

      {/* Services + price */}
      {(services || estimatedPrice) && (
        <div className="border-t border-gray-100 pt-3 flex flex-wrap items-center justify-between gap-3">
          {services && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400">Services</p>
              <p className="mt-0.5 text-sm font-medium text-gray-800">{services}</p>
            </div>
          )}
          {estimatedPrice && (
            <div className="rounded-md bg-pink-50 px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-widest text-pink-400">Estimated Price</p>
              <p className="mt-0.5 text-base font-semibold text-[#E73C6E]">{estimatedPrice}</p>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[10px] uppercase tracking-widest text-gray-400">Notes</p>
          <p className="mt-0.5 text-sm text-gray-700 whitespace-pre-line">{notes}</p>
        </div>
      )}
    </div>
  );
}
