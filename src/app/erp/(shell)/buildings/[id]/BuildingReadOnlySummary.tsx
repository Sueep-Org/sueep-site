type Props = {
  name: string;
  address: string;
  builder: string | null;
  pmName: string | null;
  pmEmail: string | null;
  pmPhone: string | null;
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-0.5 text-sm text-gray-900">{value || "Not set"}</p>
    </div>
  );
}

/** Read-only view of a building's Details tab for roles that shouldn't edit
 * or delete buildings (supervisors and employees) — see the Units tab for
 * what they can actually do here. */
export function BuildingReadOnlySummary({ name, address, builder, pmName, pmEmail, pmPhone }: Props) {
  return (
    <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:grid-cols-2">
      <Field label="Building name" value={name} />
      <Field label="Address" value={address} />
      <Field label="Builder" value={builder} />
      <Field label="Property manager name" value={pmName} />
      <Field label="Property manager email" value={pmEmail} />
      <Field label="Property manager phone" value={pmPhone} />
    </div>
  );
}
